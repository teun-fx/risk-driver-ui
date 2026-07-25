/**
 * Monte Carlo engine: 10,000 bootstrap resamples of the strategy's own trade
 * returns, run in a Web Worker on typed arrays so the UI never blocks.
 *
 * Reproducibility contract: every simulation s derives its RNG from
 * (seed ^ s·knuth), so a run is fully determined by {seed, returns, scale}.
 * That's what lets us persist only the seed + settings and still reproduce
 * best/worst paths later instead of storing 10,000 curves.
 *
 * Risk scaling multiplies each per-trade return by (chosenRisk/originalRisk).
 * Signs are preserved, so win rate and losing-streak lengths are provably
 * unchanged — exactly as the spec demands. True R-multiples aren't in an MT5
 * statement, so scaling is only offered when the original risk is known
 * (entered at import); we never invent a risk value.
 */

export type McRequest = {
  /** Per-trade fractional returns, in original order (net of costs). */
  returns: Float32Array;
  startBalance: number;
  seed: number;
  /** Return multiplier = chosenRisk / originalRisk (1 = original). */
  scale: number;
  /** Return targets as fractions (0.05 = +5%) to track hit-time for. */
  targets: number[];
  sims?: number;
};

export type McResult = {
  sims: number;
  nTrades: number;
  /** Final equity per simulation. */
  finals: Float32Array;
  /** Max drawdown fraction per simulation (positive numbers). */
  maxDD: Float32Array;
  /** Longest losing streak per simulation. */
  streaks: Int16Array;
  /** Longest stagnation (trades below prior peak) per simulation. */
  stagnation: Int32Array;
  /** 1 if the simulation ended below its running peak. */
  endUnderwater: Uint8Array;
  /** First trade index (1-based) at which target t was reached; -1 = never. t-major. */
  hitSteps: Int32Array;
  /** Mean equity at every trade number (full resolution, N+1 incl. start). */
  avgPath: Float32Array;
  bestPath: Float32Array;
  worstPath: Float32Array;
  /** Downsampled equity grid for the cloud: sims × cloudSteps. */
  cloud: Float32Array;
  /** Trade numbers for each cloud/curve column. */
  cloudX: Int32Array;
  /** Percentile curves at the cloud columns. */
  p5: Float32Array;
  p25: Float32Array;
  p50: Float32Array;
  p75: Float32Array;
  p95: Float32Array;
};

/* The worker body is plain self-contained JS (string-concat only — no
   template placeholders), shipped via Blob URL so no bundler involvement. */
const WORKER_SRC = String.raw`
'use strict';
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
self.onmessage=function(ev){
  var d=ev.data;
  var returns=d.returns, start=d.startBalance, seed=d.seed>>>0, scale=d.scale;
  var targets=d.targets, P=d.sims||10000, N=returns.length, T=targets.length;

  // Cloud/curve columns: at most ~140 steps across the trade axis.
  var S=Math.min(N,140);
  var cloudX=new Int32Array(S);
  for(var k=0;k<S;k++)cloudX[k]=Math.max(1,Math.round((k+1)*N/S));

  var finals=new Float32Array(P), maxDD=new Float32Array(P);
  var streaks=new Int16Array(P), stag=new Int32Array(P);
  var endUW=new Uint8Array(P), hit=new Int32Array(T*P); hit.fill(-1);
  var cloud=new Float32Array(P*S);
  var sumPath=new Float64Array(N+1);
  var thresholds=new Float64Array(T);
  for(var t=0;t<T;t++)thresholds[t]=start*(1+targets[t]);

  var bestIdx=0,worstIdx=0,bestFinal=-Infinity,worstFinal=Infinity;

  for(var s=0;s<P;s++){
    var rng=mulberry32((seed^Math.imul(s+1,2654435761))>>>0);
    var eq=start,peak=start,dd=0,run=0,maxRun=0,uw=0,maxUw=0,ci=0;
    sumPath[0]+=eq;
    for(var i=0;i<N;i++){
      var r=returns[(rng()*N)|0]*scale;
      eq+=eq*r;
      // Drawdown & stagnation against the running peak.
      if(eq>=peak){peak=eq;uw=0;}else{uw++;if(uw>maxUw)maxUw=uw;var dnow=(peak-eq)/peak;if(dnow>dd)dd=dnow;}
      if(r<0){run++;if(run>maxRun)maxRun=run;}else if(r>0){run=0;}
      for(var t2=0;t2<T;t2++){if(hit[t2*P+s]===-1&&eq>=thresholds[t2])hit[t2*P+s]=i+1;}
      sumPath[i+1]+=eq;
      if(ci<S&&i+1===cloudX[ci]){cloud[s*S+ci]=eq;ci++;}
    }
    finals[s]=eq;maxDD[s]=dd;streaks[s]=maxRun;stag[s]=maxUw;endUW[s]=eq<peak?1:0;
    if(eq>bestFinal){bestFinal=eq;bestIdx=s;}
    if(eq<worstFinal){worstFinal=eq;worstIdx=s;}
    if((s&1023)===0)self.postMessage({kind:'progress',done:s,total:P});
  }

  // Replay the two extreme sims at full resolution (cheap, deterministic).
  function replay(idx){
    var rng=mulberry32((seed^Math.imul(idx+1,2654435761))>>>0);
    var path=new Float32Array(N+1);var eq=start;path[0]=eq;
    for(var i=0;i<N;i++){eq+=eq*returns[(rng()*N)|0]*scale;path[i+1]=eq;}
    return path;
  }
  var bestPath=replay(bestIdx),worstPath=replay(worstIdx);
  var avgPath=new Float32Array(N+1);
  for(var i2=0;i2<=N;i2++)avgPath[i2]=sumPath[i2]/P;

  // Percentile curves per cloud column.
  var p5=new Float32Array(S),p25=new Float32Array(S),p50=new Float32Array(S),p75=new Float32Array(S),p95=new Float32Array(S);
  var col=new Float32Array(P);
  for(var k2=0;k2<S;k2++){
    for(var s2=0;s2<P;s2++)col[s2]=cloud[s2*S+k2];
    var sorted=col.slice().sort();
    p5[k2]=sorted[(0.05*(P-1))|0];p25[k2]=sorted[(0.25*(P-1))|0];
    p50[k2]=sorted[(0.50*(P-1))|0];p75[k2]=sorted[(0.75*(P-1))|0];
    p95[k2]=sorted[(0.95*(P-1))|0];
  }

  var payload={kind:'done',sims:P,nTrades:N,finals:finals,maxDD:maxDD,streaks:streaks,stagnation:stag,endUnderwater:endUW,hitSteps:hit,avgPath:avgPath,bestPath:bestPath,worstPath:worstPath,cloud:cloud,cloudX:cloudX,p5:p5,p25:p25,p50:p50,p75:p75,p95:p95};
  self.postMessage(payload,[finals.buffer,maxDD.buffer,streaks.buffer,stag.buffer,endUW.buffer,hit.buffer,avgPath.buffer,bestPath.buffer,worstPath.buffer,cloud.buffer,cloudX.buffer,p5.buffer,p25.buffer,p50.buffer,p75.buffer,p95.buffer]);
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
      if (ev.data.kind === "progress") {
        onProgress?.(ev.data.done, ev.data.total);
      } else if (ev.data.kind === "done") {
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
    // Copy the returns buffer — the caller keeps its version.
    worker.postMessage({ ...req, returns: req.returns.slice() });
  });
  return {
    promise,
    cancel: () => {
      if (!settled) worker.terminate();
    },
  };
}

/* ---------- client-side helpers over the result arrays ---------- */

export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (!n) return 0;
  return sorted[Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))];
}

export function sortedCopy(a: Float32Array | Int16Array | Int32Array) {
  return Float64Array.from(a).sort();
}

/** Fraction of entries >= threshold. */
export function probAtLeast(a: ArrayLike<number>, threshold: number) {
  let c = 0;
  for (let i = 0; i < a.length; i++) if (a[i] >= threshold) c++;
  return c / a.length;
}
