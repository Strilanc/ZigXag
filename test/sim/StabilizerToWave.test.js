import {Suite, assertThat, assertThrows, assertTrue} from "test/TestUtil.js"
import {ZxGraph, ZxNodePos, ZxEdgePos, ZxPort} from "src/sim/ZxGraph.js"
import {stabilizerStateToWavefunction} from "src/sim/StabilizerToWave.js"
import {Matrix} from "src/base/Matrix.js"
import {Complex} from "src/base/Complex.js"
import {PauliProduct} from "src/sim/PauliProduct.js"


let suite = new Suite("stabilizerStateToWavefunction");


suite.test("stabilizerStateToWavefunction", () => {
    let s = Math.sqrt(0.5);
    let i = Complex.I;
    let f = (...e) => stabilizerStateToWavefunction(e.map(PauliProduct.fromString));

    assertThat(f('+Z')).isApproximatelyEqualTo(Matrix.col(1, 0));
    assertThat(f('-Z')).isApproximatelyEqualTo(Matrix.col(0, 1));
    assertThat(f('+X')).isApproximatelyEqualTo(Matrix.col(s, s));
    assertThat(f('-X')).isApproximatelyEqualTo(Matrix.col(s, -s));
    assertThat(f('+Y')).isApproximatelyEqualTo(Matrix.col(s, i.times(s)));
    assertThat(f('-Y')).isApproximatelyEqualTo(Matrix.col(s, i.times(-s)));

    assertThat(f('+Z.', '+.Z')).isApproximatelyEqualTo(Matrix.col(1, 0, 0, 0));
    assertThat(f('+Z.', '+ZZ')).isApproximatelyEqualTo(Matrix.col(1, 0, 0, 0));
    assertThat(f('-Z.', '+ZZ')).isApproximatelyEqualTo(Matrix.col(0, 0, 0, 1));
    assertThat(f('+ZZ', '+XX')).isApproximatelyEqualTo(Matrix.col(s, 0, 0, s));

    assertThat(f('+XX', '-YY')).isApproximatelyEqualTo(Matrix.col(s, 0, 0, s));
    assertThat(f('+XYZ', '+XZY', '+ZZZ')).isApproximatelyEqualTo(
        Matrix.col(0.5, 0, 0, i.times(0.5), 0, i.times(0.5), 0.5, 0));

    assertThat(f('+XX', '-ZY')).isApproximatelyEqualTo(Matrix.col(1, i.neg(), i.neg(), 1).times(0.5));
});
