import Cycle from '@cycle/xstream-run';
import {makeDOMDriver} from '@cycle/dom';
import {recycler, recyclable} from '../src/recycle';

var app = require('./counter').default;

const drivers = () => ({
  DOM: recyclable(makeDOMDriver('.app'))
});

const recycle = recycler(Cycle, app, drivers);

if (module.hot) {
  module.hot.accept('./counter', () => {
    app = require('./counter').default;

    recycle(app);
  });
}
