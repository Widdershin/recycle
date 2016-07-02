import Cycle from '@cycle/xstream-run';
import now from 'performance-now';

function isFunction (value) {
  return typeof value === 'function';
}

function isObject (value) {
  return typeof value === 'object';
}

function isStream (value) {
  return isFunction(value.subcribe) || isFunction(value.addListener);
}

const SourceType = either({
  'object': (sources) => isObject(sources) && !isStream(sources),
  'stream': isStream
});

export function recycle (app, drivers, {sources, sinks, dispose}) {
  dispose();

  const {run, sinks: newSinks, sources: newSources} = Cycle(app, drivers);

  run();

  Object.keys(drivers).forEach(driverName => {
    const driver = drivers[driverName];

    driver.replayLog();
  });

  return {sinks: newSinks, sources: newSources};
}

export function recyclable (driver) {
  const log = [];
  let proxySource$;

  function recyclableDriver (sink$, streamAdaptor) {
    const sources = SourceType(driver(sink$, streamAdaptor));

    return sources.when({
      'object': (sources) => { throw new Error('not yet implemented'); },
      'stream': (source$) => {
        proxySource$ = source$;

        return source$.debug(event => {
          log.push({event, time: now()});
        });
      }
    });
  }

  recyclableDriver.replayLog = function replayLog () {
    log.forEach((logEvent) => {
      proxySource$.shamefullySendNext(logEvent.event);
    });
  };

  return recyclableDriver;
}

function either (states) {
  return (value) => ({
    when (handlers) {
      for (const state of Object.keys(states)) {
        const stateValidator = states[state];

        if (handlers[state] === undefined) {
          throw new Error(`Must handle possible state ${state}`);
        }

        if (stateValidator(value)) {
          return handlers[state](value);
        }
      }
    }
  });
}
