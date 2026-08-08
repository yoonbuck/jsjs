/**
 * @template TResult
 * @param {{
 *   post: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>,
 *   metrics: readonly string[],
 *   samplingInterval: number,
 *   run: () => Promise<TResult>,
 * }} options
 * @returns {Promise<{
 *   result: TResult,
 *   cpuProfile?: unknown,
 *   allocationProfile?: unknown,
 * }>}
 */
export async function captureProtocolProfiles({
  post,
  metrics,
  samplingInterval,
  run,
}) {
  const captureCpu = metrics.includes('cpu');
  const captureAllocation = metrics.includes('allocation');
  /** @type {TResult | undefined} */
  let result;
  /** @type {unknown} */
  let cpuProfile;
  /** @type {unknown} */
  let allocationProfile;
  /** @type {unknown} */
  let failure;

  if (captureCpu) {
    await post('Profiler.enable');
    await post('Profiler.setSamplingInterval', { interval: samplingInterval });
    await post('Profiler.start');
  }

  if (captureAllocation) {
    await post('HeapProfiler.enable');
    await post('HeapProfiler.startSampling', {
      samplingInterval,
    });
  }

  try {
    result = await run();
  } catch (error) {
    failure = error;
  }

  try {
    if (captureAllocation) {
      allocationProfile = (await post('HeapProfiler.stopSampling')).profile;
    }

    if (captureCpu) {
      cpuProfile = (await post('Profiler.stop')).profile;
    }
  } catch (error) {
    if (failure === undefined) {
      failure = error;
    }
  } finally {
    if (captureAllocation) {
      try {
        await post('HeapProfiler.disable');
      } catch (error) {
        if (failure === undefined) {
          failure = error;
        }
      }
    }

    if (captureCpu) {
      try {
        await post('Profiler.disable');
      } catch (error) {
        if (failure === undefined) {
          failure = error;
        }
      }
    }
  }

  if (failure !== undefined) {
    throw failure;
  }

  if (result === undefined) {
    throw new Error('Protocol capture did not produce a result');
  }

  return Object.freeze({
    result,
    ...(captureCpu ? { cpuProfile } : {}),
    ...(captureAllocation ? { allocationProfile } : {}),
  });
}
