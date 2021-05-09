import {Suite, assertThat, assertThrows, assertTrue, assertFalse} from "test/TestUtil.js"
import {stim} from "src/ext/stim.js"

let suite = new Suite("stim");

suite.test('kickback_vs_stabilizer', () => {
    let sim = new stim.TableauSimulator().deleteLater();
    sim.H(2);
    sim.CNOT(2, 0);
    sim.CNOT(2, 1);
    sim.S(0);
    sim.S(1);
    sim.H(0);
    sim.H(1);
    sim.H(2);
    assertThat(sim.current_inverse_tableau().inverse().toString()).isEqualTo(`
+-xz-xz-xz-
| -+ -+ ++
| YX __ _Y
| __ YX _Y
| _X _X XZ
    `.trim());
});
