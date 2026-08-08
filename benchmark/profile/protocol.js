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
  let cpuEnabled = false;
  let cpuStarted = false;
  let allocationEnabled = false;
  let allocationStarted = false;
  /** @type {TResult | undefined} */
  let result;
  /** @type {unknown} */
  let cpuProfile;
  /** @type {unknown} */
  let allocationProfile;
  /** @type {unknown} */
  let failure;

  try {
    if (captureCpu) {
      await post('Profiler.enable');
      cpuEnabled = true;
      await post('Profiler.setSamplingInterval', {
        interval: samplingInterval,
      });
      await post('Profiler.start');
      cpuStarted = true;
    }

    if (captureAllocation) {
      await post('HeapProfiler.enable');
      allocationEnabled = true;
      await post('HeapProfiler.startSampling', {
        samplingInterval,
      });
      allocationStarted = true;
    }

    result = await run();
  } catch (error) {
    rememberFailure(error);
  } finally {
    if (allocationStarted) {
      try {
        allocationProfile = (await post('HeapProfiler.stopSampling')).profile;
      } catch (error) {
        rememberFailure(error);
      }
    }

    if (cpuStarted) {
      try {
        cpuProfile = (await post('Profiler.stop')).profile;
      } catch (error) {
        rememberFailure(error);
      }
    }

    if (allocationEnabled) {
      try {
        await post('HeapProfiler.disable');
      } catch (error) {
        rememberFailure(error);
      }
    }

    if (cpuEnabled) {
      try {
        await post('Profiler.disable');
      } catch (error) {
        rememberFailure(error);
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

  /**
   * @param {unknown} error
   * @returns {void}
   */
  function rememberFailure(error) {
    if (failure === undefined) {
      failure = error;
    }
  }
}
