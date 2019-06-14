import {Suite, assertThat, assertThrows, assertTrue, assertFalse} from "test/TestUtil.js"

import {ChpSimulator} from "src/sim/ChpSimulator.js"

let suite = new Suite("ChpSimulator");

suite.test('kickback_vs_stabilizer', () => {
    let sim = new ChpSimulator(3);
    sim.qalloc();
    sim.qalloc();
    sim.qalloc();
    sim.hadamard(2);
    sim.cnot(2, 0);
    sim.cnot(2, 1);
    sim.phase(0);
    sim.phase(1);
    sim.hadamard(0);
    sim.hadamard(1);
    sim.hadamard(2);
    assertThat(sim.toString()).isEqualTo(`
-Y..
-.Y.
+..X
----
+X.X
+.XX
+YYZ
    `.trim());
    assertThat(sim.probability(0)).isEqualTo(0.5);
    let v0 = sim.measure(0, 0);
    assertFalse(v0);
    assertThat(sim.toString()).isEqualTo(`
+X.X
-.Y.
+..X
----
+Z..
+.XX
+ZYY
    `.trim());
    assertThat(sim.probability(1)).isEqualTo(0.5);
    let v1 = sim.measure(1, 0);
    assertFalse(v1);
    assertThat(sim.toString()).isEqualTo(`
+X.X
+.XX
+..X
----
+Z..
+.Z.
-ZZZ
    `.trim());
    assertThat(sim.probability(2)).isEqualTo(1);
    let v2 = sim.measure(2);
    assertTrue(v2);
    assertThat(sim.toString()).isEqualTo(`
+X.X
+.XX
+..X
----
+Z..
+.Z.
-ZZZ
    `.trim());
});
