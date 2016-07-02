/* globals describe, it */
import {recycle, recyclable} from '../src/recycle';
import assert from 'assert';
import fromDiagram from 'xstream/extra/fromDiagram';
import Cycle from '@cycle/xstream-run';
import now from 'performance-now';
import _ from 'lodash';
import chalk from 'chalk';

const DEBUG = false;

const toDiagram = (valuesInOrder, startTime) => {
  const valuesByTime = _.groupBy(valuesInOrder, 'time');

  const maxTime = Math.round((now() - startTime) / 20);

  return _.range(maxTime).map(pointInTime => {
    const values = valuesByTime[pointInTime];

    if (!values || values.length === 0) {
      return '-';
    }

    if (values.length === 1) {
      return values[0].ev.toString();
    }

    return `(${values.map(value => value.ev).join('')})`;
  }).join('');
};

function expectEqual (a, b, done, startTime = now()) {
  const aValues = [];
  const bValues = [];

  let doneCalled = 0;

  const doneCallback = (label) => {
    doneCalled += 1;

    if (doneCalled !== 2) {
      return;
    }

    if (aValues.length !== bValues.length) {
      done(new Error('Streams are different lengths'));
    }

    if (DEBUG) {
      console.log('a', toDiagram(aValues, startTime));
      console.log('b', toDiagram(bValues, startTime));
    }

    assert.equal(toDiagram(aValues, startTime), toDiagram(bValues, startTime));

    done();
  };

  const makeListener = (label, values) => (
    {
      next: ev => {
        values.push({ev, time: Math.round((now() - startTime) / 20)});
      },
      error: done,
      complete () {
        doneCallback(label);
      }
    }
  );

  a.addListener(makeListener('a', aValues));
  b.addListener(makeListener('b', bValues));

  return startTime;
}

describe('recycle', () => {
  it('restarts running cycle apps by replaying source actions', (done) => {
    function main ({click$}) {
      const count$ = click$.fold((total) => total + 1, 0);

      return {
        count$
      };
    }

    const streams = {
      clickInput:        fromDiagram('----1--1--1-----------------|'),
      expectedCount:     fromDiagram('0---1--2--3---|             '),
      expectedNewCount:  fromDiagram('              0---1--2--3---|')
    };

    const drivers = {
      click$: recyclable(() => streams.clickInput)
    };

    const {sinks, sources, run} = Cycle(main, drivers);

    const dispose = run();

    const startTime = expectEqual(streams.expectedCount, sinks.count$, (err) => {
      if (err) {
        done(err);
      }

      const newSinksAndSources = recycle(main, drivers, {sinks, sources, dispose});

      setTimeout(() => {
        expectEqual(streams.expectedNewCount, newSinksAndSources.sinks.count$, done, startTime);
      }, 60);
    });
  });

  it('handles drivers that return objects as sources', (done) => {
    function main ({click$}) {
      const count$ = click$.times(2).fold((total, value) => total + value, 0);

      return {
        count$
      };
    }

    const streams = {
      clickInput:        fromDiagram('----1--1--1-----------------|'),
      expectedCount:     fromDiagram('0---2--4--6---|             '),
      expectedNewCount:  fromDiagram('              0---2--4--6---|')
    };

    const drivers = {
      click$: recyclable(() => ({times: (multiplier) => streams.clickInput.map(i => i * multiplier)}))
    };

    const {sinks, sources, run} = Cycle(main, drivers);

    const dispose = run();

    const startTime = expectEqual(streams.expectedCount, sinks.count$, (err) => {
      if (err) {
        done(err);
      }

      const newSinksAndSources = recycle(main, drivers, {sinks, sources, dispose});

      setTimeout(() => {
        assert.equal(drivers.click$.log.length, 3);

        expectEqual(streams.expectedNewCount, newSinksAndSources.sinks.count$, done, startTime);
      }, 60);
    });
  });
});
