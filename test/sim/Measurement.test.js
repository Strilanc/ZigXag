import {Suite, assertThat, EqualsTester} from "test/TestUtil.js"

import {Measurement} from "src/sim/Measurement.js"

let suite = new Suite("Measurement");

suite.test('constructor', () => {
    let m = new Measurement(false, true);
    assertThat(m.result).isEqualTo(false);
    assertThat(m.random).isEqualTo(true);
});
suite.test('equality', () => {
    let eq = new EqualsTester();
    eq.assertAddGeneratedPair(() => new Measurement(false, false));
    eq.assertAddGroup(new Measurement(false, true));
    eq.assertAddGroup(new Measurement(true, true));
    eq.assertAddGroup(new Measurement(true, false));
});

suite.test('toString', () => {
    assertThat(new Measurement(false, false).toString()).isEqualTo('false (determined)');
    assertThat(new Measurement(true, false).toString()).isEqualTo('true (determined)');
    assertThat(new Measurement(false, true).toString()).isEqualTo('false (random)');
    assertThat(new Measurement(true, true).toString()).isEqualTo('true (random)');
});
