/**
 * Monte Carlo engine — block-bootstrap resampling of the strategy's own trade
 * returns, run in a Web Worker on typed arrays so the UI never blocks.
 *
 * Why block bootstrap: sampling single trades destroys autocorrelation, so
 * simulated paths never contain realistic losing runs. We resample contiguous
 * BLOCKS of variable length instead, which preserves streakiness and produces
 * drawdowns of a believable shape.
 *
 * Three sampling models, all drawn from the same real history:
 *  - baseline      uniform block starts across the whole database
 *  - recent        block starts weighted exponentially toward recent trades
 *  - conservative  block starts weighted toward historically weaker blocks,
 *                  i.e. the lower percentiles of the strategy's own behaviour
 *
 * Reproducibility: sim s derives its RNG from (seed ^ s·knuth), so a run is
 * fully determined by {seed, returns, model, scale} — we persist the seed, not
 * 10,000 curves.
 *
 * Risk scaling multiplies each return by (chosenRisk/originalRisk). Signs are
 * preserved, so win rate and losing-streak LENGTHS are provably unchanged.
 */

export type McModel = "baseline" | "recent" | "conservative";

export const MODEL_LABELS: Record<McModel, string> = {
  baseline: "Historical baseline",
  recent: "Recent-weighted",
  conservative: "Conservative",
};

export const MODEL_BLURBS: Record<McModel, string> = {
  baseline:
    "Samples blocks uniformly from the entire trade history. Every period of the strategy's life is weighted equally.",
  recent:
    "Same history, but recent trades are far more likely to be drawn. Reflects how the strategy has behaved lately rather than on average.",
  conservative:
    "Weights sampling toward the strategy's historically weaker blocks, so the projection leans on its lower percentiles rather than its typical behaviour.",
};

export type McRequest = {
  /** Per-trade fractional returns, in original order (net of costs). */
  returns: Float32Array;
  startBalance: number;
  seed: number;
  /** Return multiplier = chosenRisk / originalRisk (1 = original). */
  scale: number;
  model: McModel;
  /** Calendar days per trade, for the CAGR estimate. 0 = unknown. */
  daysPerTrade: number;
  sims?: number;
};

export type McResult = {
  sims: number;
  nTrades: number;
  model: McModel;
  finals: Float32Array;
  maxDD: Float32Array;
  streaks: Int16Array;
  /** Trades from the deepest trough back to a new high; -1 = never recovered. */
  recovery: Int32Array;
  /** Touch flags, in order: +5%, +10%, -5%, -10%. */
  touch: Uint8Array;
  avgPath: Float32Array;
  bestPath: Float32Array;
  worstPath: Float32Array;
  cloud: Float32Array;
  cloudX: Int32Array;
  /** Percentile curves for the 50 / 80 / 95% bands. */
  p2_5: Float32Array;
  p10: Float32Array;
  p25: Float32Array;
  p50: Float32Array;
  p75: Float32Array;
  p90: Float32Array;
  p97_5: Float32Array;
  /** Median running drawdown at each column — the expected-drawdown band. */
  ddBand: Float32Array;
};

const WORKER_SRC = String.raw`
'use strict';
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}

self.onmessage=function(ev){
  var d=ev.data;
  var R=d.returns, start=d.startBalance, seed=d.seed>>>0, scale=d.scale;
  var model=d.model, P=d.sims||10000, N=R.length;

  // ---- block-start sampling weights (cumulative), per model ----
  var minB=Math.max(2,Math.round(N*0.02)), maxB=Math.max(minB+1,Math.round(N*0.10));
  var w=new Float64Array(N);
  if(model==='recent'){
    // Exponential recency: the newest trade ~8x likelier than the oldest.
    for(var i=0;i<N;i++) w[i]=Math.exp(2.08*(i/(N-1||1)));
  } else if(model==='conservative'){
    // Weight toward blocks whose forward mean return is below the median.
    var bm=new Float64Array(N), span=Math.min(N,maxB);
    for(var i2=0;i2<N;i2++){
      var s=0,c=0;
      for(var j=i2;j<Math.min(N,i2+span);j++){s+=R[j];c++;}
      bm[i2]=c?s/c:0;
    }
    var sorted=Float64Array.from(bm).sort();
    var med=sorted[(sorted.length/2)|0];
    var lo=sorted[0], hi=sorted[sorted.length-1], rng2=(hi-lo)||1;
    for(var i3=0;i3<N;i3++){
      // 1 at the weakest block, ~0.15 at the strongest; below-median favoured.
      var norm=(bm[i3]-lo)/rng2;
      w[i3]=(bm[i3]<=med?1.0:0.35)*(1.15-norm);
      if(w[i3]<0.02)w[i3]=0.02;
    }
  } else {
    for(var i4=0;i4<N;i4++) w[i4]=1;
  }
  var cum=new Float64Array(N), acc=0;
  for(var i5=0;i5<N;i5++){acc+=w[i5];cum[i5]=acc;}
  var total=acc;
  function pickStart(u){
    var target=u*total, lo2=0, hi2=N-1;
    while(lo2<hi2){var mid=(lo2+hi2)>>1; if(cum[mid]<target)lo2=mid+1; else hi2=mid;}
    return lo2;
  }

  var S=Math.min(N,140);
  var cloudX=new Int32Array(S);
  for(var k=0;k<S;k++)cloudX[k]=Math.max(1,Math.round((k+1)*N/S));

  var finals=new Float32Array(P), maxDD=new Float32Array(P);
  var streaks=new Int16Array(P), recovery=new Int32Array(P);
  var touch=new Uint8Array(P*4);
  var cloud=new Float32Array(P*S);
  var ddCloud=new Float32Array(P*S);
  var sumPath=new Float64Array(N+1);
  var bestIdx=0,worstIdx=0,bestFinal=-Infinity,worstFinal=Infinity;

  var up5=start*1.05, up10=start*1.10, dn5=start*0.95, dn10=start*0.90;

  for(var s2=0;s2<P;s2++){
    var rng=mulberry32((seed^Math.imul(s2+1,2654435761))>>>0);
    var eq=start,peak=start,dd=0,run=0,maxRun=0,ci=0;
    var troughIdx=-1,troughEq=start,recTrades=-1,deepest=0;
    var t5=0,t10=0,b5=0,b10=0;
    sumPath[0]+=eq;

    var i=0;
    while(i<N){
      // Variable-length contiguous block from the real sequence.
      var blen=minB+((rng()*(maxB-minB+1))|0);
      var st=pickStart(rng());
      for(var b=0;b<blen&&i<N;b++,i++){
        var r=R[(st+b)%N]*scale;
        eq+=eq*r;
        if(eq>=peak){
          peak=eq;
          if(troughIdx>=0&&recTrades<0)recTrades=i-troughIdx;
        } else {
          var dnow=(peak-eq)/peak;
          if(dnow>dd){dd=dnow;}
          if(dnow>deepest){deepest=dnow;troughIdx=i;troughEq=eq;recTrades=-1;}
        }
        if(r<0){run++;if(run>maxRun)maxRun=run;}else if(r>0){run=0;}
        if(eq>=up5)t5=1;
        if(eq>=up10)t10=1;
        if(eq<=dn5)b5=1;
        if(eq<=dn10)b10=1;
        sumPath[i+1]+=eq;
        if(ci<S&&i+1===cloudX[ci]){cloud[s2*S+ci]=eq;ddCloud[s2*S+ci]=(peak-eq)/peak;ci++;}
      }
    }
    finals[s2]=eq;maxDD[s2]=dd;streaks[s2]=maxRun;recovery[s2]=recTrades;
    touch[s2*4]=t5;touch[s2*4+1]=t10;touch[s2*4+2]=b5;touch[s2*4+3]=b10;
    if(eq>bestFinal){bestFinal=eq;bestIdx=s2;}
    if(eq<worstFinal){worstFinal=eq;worstIdx=s2;}
    if((s2&1023)===0)self.postMessage({kind:'progress',done:s2,total:P});
  }

  // Replay the two extremes at full resolution (deterministic, cheap).
  function replay(idx){
    var rng=mulberry32((seed^Math.imul(idx+1,2654435761))>>>0);
    var path=new Float32Array(N+1);var eq2=start;path[0]=eq2;var i6=0;
    while(i6<N){
      var blen2=minB+((rng()*(maxB-minB+1))|0);
      var st2=pickStart(rng());
      for(var b2=0;b2<blen2&&i6<N;b2++,i6++){
        eq2+=eq2*R[(st2+b2)%N]*scale;path[i6+1]=eq2;
      }
    }
    return path;
  }
  var bestPath=replay(bestIdx),worstPath=replay(worstIdx);
  var avgPath=new Float32Array(N+1);
  for(var i7=0;i7<=N;i7++)avgPath[i7]=sumPath[i7]/P;

  function pctCurves(){
    var a=new Float32Array(S),b3=new Float32Array(S),c=new Float32Array(S),
        e=new Float32Array(S),f=new Float32Array(S),g=new Float32Array(S),h=new Float32Array(S),
        ddb=new Float32Array(S);
    var col=new Float32Array(P), dcol=new Float32Array(P);
    for(var k2=0;k2<S;k2++){
      for(var s3=0;s3<P;s3++){col[s3]=cloud[s3*S+k2];dcol[s3]=ddCloud[s3*S+k2];}
      var so=col.slice().sort(), dso=dcol.slice().sort();
      a[k2]=so[(0.025*(P-1))|0];b3[k2]=so[(0.10*(P-1))|0];c[k2]=so[(0.25*(P-1))|0];
      e[k2]=so[(0.50*(P-1))|0];f[k2]=so[(0.75*(P-1))|0];g[k2]=so[(0.90*(P-1))|0];
      h[k2]=so[(0.975*(P-1))|0];
      ddb[k2]=dso[(0.50*(P-1))|0];
    }
    return {a:a,b:b3,c:c,e:e,f:f,g:g,h:h,ddb:ddb};
  }
  var pc=pctCurves();

  var payload={kind:'done',sims:P,nTrades:N,model:model,
    finals:finals,maxDD:maxDD,streaks:streaks,recovery:recovery,touch:touch,
    avgPath:avgPath,bestPath:bestPath,worstPath:worstPath,
    cloud:cloud,cloudX:cloudX,
    p2_5:pc.a,p10:pc.b,p25:pc.c,p50:pc.e,p75:pc.f,p90:pc.g,p97_5:pc.h,ddBand:pc.ddb};
  self.postMessage(payload,[finals.buffer,maxDD.buffer,streaks.buffer,recovery.buffer,
    touch.buffer,avgPath.buffer,bestPath.buffer,worstPath.buffer,cloud.buffer,cloudX.buffer,
    pc.a.buffer,pc.b.buffer,pc.c.buffer,pc.e.buffer,pc.f.buffer,pc.g.buffer,pc.h.buffer,pc.ddb.buffer]);
};
`;

let workerUrl: string | null = null;
function getWorkerUrl() {
  if (!workerUrl) {
    workerUrl = URL.createObjectURL(
      new Blob([WORKER_SRC], { type: "text/javascript" }),
    );
  }
  return workerUrl;
}

export function runMonteCarlo(
  req: McRequest,
  onProgress?: (done: number, total: number) => void,
): { promise: Promise<McResult>; cancel: () => void } {
  const worker = new Worker(getWorkerUrl());
  let settled = false;
  const promise = new Promise<McResult>((resolve, reject) => {
    worker.onmessage = (ev) => {
      if (ev.data.kind === "progress") onProgress?.(ev.data.done, ev.data.total);
      else if (ev.data.kind === "done") {
        settled = true;
        worker.terminate();
        resolve(ev.data as McResult);
      }
    };
    worker.onerror = (e) => {
      settled = true;
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage({ ...req, returns: req.returns.slice() });
  });
  return {
    promise,
    cancel: () => {
      if (!settled) worker.terminate();
    },
  };
}

/* ---------- helpers over the result arrays ---------- */

export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (!n) return 0;
  return sorted[Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))];
}

export function sortedCopy(a: Float32Array | Int16Array | Int32Array) {
  return Float64Array.from(a).sort();
}

export function probAtLeast(a: ArrayLike<number>, threshold: number) {
  let c = 0;
  for (let i = 0; i < a.length; i++) if (a[i] >= threshold) c++;
  return c / a.length;
}

/** Share of sims whose flag at `slot` (0..3) is set. */
export function touchProb(touch: Uint8Array, slot: number, sims: number) {
  let c = 0;
  for (let s = 0; s < sims; s++) c += touch[s * 4 + slot];
  return c / sims;
}
