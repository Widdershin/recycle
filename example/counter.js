import xs from 'xstream';
import {div, button, p} from '@cycle/dom';

export default function main (sources) {
  let action$ = xs.merge(
    sources.DOM.select('.decrement').events('click').map(ev => -2),
    sources.DOM.select('.increment').events('click').map(ev => +2)
  );

  let count$ = action$.fold((x, y) => x + y, 0);

  return {
    DOM: count$.map(count =>
        div([
          button('.decrement', 'Decrement'),
          button('.increment', 'Increment'),
          p('Counter: ' + count)
        ])
      )
  };
}
