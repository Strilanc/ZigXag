// Copyright 2017 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {Suite, assertThat, assertThrows, assertTrue, assertFalse} from "test/TestUtil.js"

import {VectorSimulator} from "src/sim/VectorSimulator.js"
import {ChpSimulator} from "src/sim/ChpSimulator.js"
import {Measurement} from "src/sim/Measurement.js"

let suite = new Suite("Simulators");

let simulators = [
    {name: 'VectorSimulator', factory: _ => new VectorSimulator()},
    {name: 'ChpSimulator', factory: n => new ChpSimulator(n)},
];

/**
 * @param {!string} test_name
 * @param {!function(!SimulatorSpec)} testFunc
 * @param {!int=} maxQubitCount
 */
function sim_test(test_name, testFunc, maxQubitCount=10) {
    for (let {name, factory} of simulators) {
        suite.test(`${test_name}[${name}]`, () => {
            let sim = factory();
            try {
                testFunc(sim);
            } finally {
                sim.destruct();
            }
        });
    }
}

sim_test('zero', sim => {
    let q = sim.qalloc();
    assertThat(sim.blochVector(q)).isApproximatelyEqualTo({x: 0, y: 0, z: +1});
    assertFalse(sim.measure(q).result);
    assertThat(sim.blochVector(q)).isApproximatelyEqualTo({x: 0, y: 0, z: +1});
});

sim_test('toggle1', sim => {
    let q1 = sim.qalloc();
    let q2 = sim.qalloc();
    sim.x(q1);
    assertThat(sim.probability(q1)).isApproximatelyEqualTo(1);
    assertThat(sim.probability(q2)).isApproximatelyEqualTo(0);
});

sim_test('toggle2', sim => {
    let q1 = sim.qalloc();
    let q2 = sim.qalloc();
    sim.x(q2);
    assertThat(sim.probability(q1)).isApproximatelyEqualTo(0);
    assertThat(sim.probability(q2)).isApproximatelyEqualTo(1);
});

sim_test('multiple', sim => {
    let q1 = sim.qalloc();
    let q2 = sim.qalloc();
    let q3 = sim.qalloc();
    assertThat(sim.probability(q1)).isApproximatelyEqualTo(0);
    assertThat(sim.probability(q2)).isApproximatelyEqualTo(0);
    assertThat(sim.probability(q3)).isApproximatelyEqualTo(0);

    sim.hadamard(q1);
    sim.x(q2);
    sim.hadamard(q3);
    sim.phase(q3);
    assertThat(sim.blochVector(q1)).isApproximatelyEqualTo({x: +1, y: 0, z: 0});
    assertThat(sim.blochVector(q2)).isApproximatelyEqualTo({x: 0, y: 0, z: -1});
    assertThat(sim.blochVector(q3)).isApproximatelyEqualTo({x: 0, y: +1, z: 0});

    sim.free(q2);
    assertThat(sim.blochVector(q1)).isApproximatelyEqualTo({x: +1, y: 0, z: 0});
    assertThat(sim.blochVector(q3)).isApproximatelyEqualTo({x: 0, y: +1, z: 0});
    assertThrows(() => sim.blochVector(q2));
});

sim_test('hadamard', sim => {
    let q = sim.qalloc();
    sim.hadamard(q);
    assertThat(sim.blochVector(q)).isApproximatelyEqualTo({x: +1, y: 0, z: 0});
    sim.hadamard(q);
    assertThat(sim.blochVector(q)).isApproximatelyEqualTo({x: 0, y: 0, z: +1});
});

sim_test('phase', sim => {
    let q = sim.qalloc();
    sim.hadamard(q);
    sim.phase(q);
    assertThat(sim.blochVector(q)).isApproximatelyEqualTo({x: 0, y: +1, z: 0});
    sim.phase(q);
    assertThat(sim.blochVector(q)).isApproximatelyEqualTo({x: -1, y: 0, z: 0});
    sim.phase(q);
    assertThat(sim.blochVector(q)).isApproximatelyEqualTo({x: 0, y: -1, z: 0});
    sim.phase(q);
    assertThat(sim.blochVector(q)).isApproximatelyEqualTo({x: +1, y: 0, z: 0});
    sim.hadamard(q);
    sim.phase(q);
    assertThat(sim.blochVector(q)).isApproximatelyEqualTo({x: 0, y: 0, z: +1});
});

sim_test('not', sim => {
    let q = sim.qalloc();
    assertThat(sim.probability(q)).isApproximatelyEqualTo(0.0);
    sim.x(q);
    assertThat(sim.probability(q)).isApproximatelyEqualTo(1.0);
    assertTrue(sim.measure(q).result);
    assertThat(sim.probability(q)).isApproximatelyEqualTo(1.0);
    sim.x(q);
    assertThat(sim.probability(q)).isApproximatelyEqualTo(0.0);
    sim.hadamard(q);
    sim.x(q);
    sim.hadamard(q);
    assertThat(sim.probability(q)).isApproximatelyEqualTo(0.0);
});

sim_test('cnot', sim => {
    let p = sim.qalloc();
    let q = sim.qalloc();
    assertThrows(() => sim.cnot(p, p));
    assertThrows(() => sim.cnot(q, q));
    assertThat(sim.probability(p)).isApproximatelyEqualTo(0);
    assertThat(sim.probability(q)).isApproximatelyEqualTo(0);

    sim.cnot(p, q);
    assertThat(sim.probability(p)).isApproximatelyEqualTo(0);
    assertThat(sim.probability(q)).isApproximatelyEqualTo(0);

    sim.x(q);
    sim.cnot(p, q);
    assertThat(sim.probability(p)).isApproximatelyEqualTo(0);
    assertThat(sim.probability(q)).isApproximatelyEqualTo(1);

    sim.x(p);
    sim.cnot(p, q);
    assertThat(sim.probability(p)).isApproximatelyEqualTo(1);
    assertThat(sim.probability(q)).isApproximatelyEqualTo(0);

    sim.cnot(p, q);
    assertThat(sim.probability(p)).isApproximatelyEqualTo(1);
    assertThat(sim.probability(q)).isApproximatelyEqualTo(1);
});

sim_test('stateProliferation', sim => {
    let s = sim.qalloc();
    sim.hadamard(s);
    sim.phase(s);
    assertThat(sim.blochVector(s)).isApproximatelyEqualTo({x: 0, y: +1, z: 0});

    let t = sim.qalloc();
    sim.hadamard(t);

    // Kickback an S gate.
    sim.cnot(t, s);
    sim.hadamard(s);
    sim.cnot(t, s);
    sim.hadamard(s);

    assertThat(sim.blochVector(s)).isApproximatelyEqualTo({x: 0, y: +1, z: 0});
    assertThat(sim.blochVector(t)).isApproximatelyEqualTo({x: 0, y: +1, z: 0});

    // Kickback an S gate.
    sim.cnot(t, s);
    sim.hadamard(s);
    sim.cnot(t, s);
    sim.hadamard(s);

    sim.hadamard(t);
    assertThat(sim.probability(t)).isApproximatelyEqualTo(1);
});


sim_test('s_state_distillation_low_depth', sim => {
    let qs = [];
    for (let i = 0; i < 8; i++) {
        qs.push(sim.qalloc());
    }
    let anc = sim.qalloc();

    let stabilizers = [
        [0, 1, 2, 3],
        [0, 1, 4, 5],
        [0, 2, 4, 6],
        [1, 2, 4, 7]
    ];
    let checks = [
        {'s': [0], 'q': stabilizers[0]},
        {'s': [1], 'q': stabilizers[1]},
        {'s': [2], 'q': stabilizers[2]},
    ];

    let stabilizer_measurements = [];
    for (let stabilizer of stabilizers) {
        sim.hadamard(anc);
        for (let k of stabilizer) {
            sim.cnot(anc, qs[k]);
        }
        sim.hadamard(anc);
        assertThat(sim.probability(anc)).isApproximatelyEqualTo(0.5);
        let v = sim.measure(anc).result;
        if (v) {
            sim.hadamard(anc);
            sim.phase(anc);
            sim.phase(anc);
            sim.hadamard(anc);
        }
        stabilizer_measurements.push(v);
    }

    let qubit_measurements = [];
    for (let k = 0; k < 7; k++) {
        sim.phase(qs[k]);
        sim.hadamard(qs[k]);
        qubit_measurements.push(sim.measure(k).result);
    }

    let p = 0;
    for (let e of [...stabilizer_measurements, ...qubit_measurements]) {
        p ^= e ? 1 : 0;
    }
    if (p) {
        sim.phase(qs[7]);
        sim.phase(qs[7]);
    }

    sim.phase(qs[7]);
    sim.hadamard(qs[7]);
    assertThat(sim.probability(qs[7])).isApproximatelyEqualTo(0);
    let r = sim.measure(qs[7]).result;
    assertFalse(r);

    for (let c of checks) {
        let rvs = c.s.map(k => stabilizer_measurements[k]);
        let rms = c.q.map(k => qubit_measurements[k]);
        let p2 = 0;
        for (let e of [...rvs, ...rms]) {
            p2 ^= e ? 1 : 0;
        }
        assertThat(p2).isEqualTo(0);
    }
});

sim_test('s_state_distillation_low_space', sim => {
    let phasors = [
        [0],
        [1],
        [2],
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3],
    ];

    let qs = [];
    for (let i = 0; i < 4; i++) {
        qs.push(sim.qalloc());
    }
    let anc = sim.qalloc();
    qs.push(anc);
    for (let phasor of phasors) {
        sim.hadamard(anc);
        for (let k of phasor) {
            sim.cnot(anc, qs[k]);
        }
        sim.hadamard(anc);
        sim.phase(anc);
        sim.hadamard(anc);
        assertThat(sim.probability(anc)).isApproximatelyEqualTo(0.5);
        let v = sim.measure(anc).result;
        if (v) {
            for (let k of [...phasor, anc]) {
                sim.hadamard(qs[k]);
                sim.phase(qs[k]);
                sim.phase(qs[k]);
                sim.hadamard(qs[k]);
            }
        }
    }

    for (let k = 0; k < 3; k++) {
        assertThat(sim.probability(k)).isApproximatelyEqualTo(0);
        let v = sim.measure(qs[k]).result;
        assertFalse(v);
    }
    sim.phase(qs[3]);
    sim.hadamard(qs[3]);
    assertThat(sim.probability(qs[3])).isApproximatelyEqualTo(1);
    let v = sim.measure(qs[3]).result;
    assertTrue(v);
});
