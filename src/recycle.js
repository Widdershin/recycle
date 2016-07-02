import Cycle from '@cycle/xstream-run';
import now from 'performance-now';

function isFunction (value) {
  return typeof value === 'function';
}

function isObject (value) {
  return typeof value === 'object';
}

function isStream (value) {
  return !!value && (isFunction(value.subcribe) || isFunction(value.addListener));
}

const SourceType = either({
  'object': (sources) => isObject(sources) && !isStream(sources),
  'stream': isStream,
  'function': isFunction
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
  let proxySources = {};

  function logStream (stream, identifier) {
    proxySources[identifier] = stream;

    return stream.debug(event => {
      log.push({identifier, event, time: now()});
    });
  }

  function logSourceFunction (func, identifier = '') {
    return function wrappedSourceFunction (...args) {
      const source = SourceType(func(...args));
      const funcIdentifier = identifier + '/' + func.name + '(' + args.join() + ')';

      return source.when({
        'object': (value) => logSourceObject(value, funcIdentifier),
        'stream': (stream) => logStream(stream, funcIdentifier),
        'function': (func) => logSourceFunction(func, funcIdentifier)
      });
    };
  }

  function logSourceObject (sources, identifier = '') {
    const newSources = {};

    Object.keys(sources).forEach(sourceProperty => {
      const value = SourceType(sources[sourceProperty]);

      const propertyIdentifier = identifier + '/' + sourceProperty;

      const loggedSource = value.when({
        'object': (value) => logSourceObject(value, propertyIdentifier),
        'stream': (stream) => logStream(stream, propertyIdentifier),
        'function': (func) => logSourceFunction(func, propertyIdentifier)
      });

      newSources[sourceProperty] = loggedSource;
    });

    return newSources;
  }

  function recyclableDriver (sink$, streamAdaptor) {
    const sources = SourceType(driver(sink$, streamAdaptor));

    return sources.when({
      'object': (sources) => logSourceObject(sources),
      'stream': (source$) => logStream(source$, ':root'),
      'function': (func) => logSourceFunction(func, ':root')
    });
  }

  recyclableDriver.replayLog = function replayLog () {
    log.forEach((logEvent) => {
      proxySources[logEvent.identifier].shamefullySendNext(logEvent.event);
    });
  };

  recyclableDriver.log = log;

  return recyclableDriver;
}

function either (states) {
  return (value) => ({
    when (handlers) {
      const stateKeys = Object.keys(states).sort();
      const handlersKeys = Object.keys(handlers).sort();

      stateKeys.forEach((_, index) => {
        if (stateKeys[index] !== handlersKeys[index]) {
          throw new Error(`Must handle possible state ${stateKeys[index]}`);
        }
      });

      for (const state of Object.keys(states)) {
        const stateValidator = states[state];

        if (stateValidator(value)) {
          return handlers[state](value);
        }
      }

      throw new Error(`Unhandled possible type: ${value}`);
    }
  });
}
