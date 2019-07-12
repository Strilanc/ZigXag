import {Suite, assertThat, assertThrows, assertTrue} from "test/TestUtil.js"
import {ZxGraph, ZxNode, ZxEdge, ZxPort} from "src/sim/ZxGraph.js"
import {Matrix} from "src/base/Matrix.js"
import {Complex} from "src/base/Complex.js"
import {PauliProduct} from "src/sim/PauliProduct.js"

import {Tensor, evalZxGraphGroundTruth} from "src/sim/ZxGraphGroundTruth.js"


let suite = new Suite("ZxGraphGroundTruth");


/**
 * @param {!int} n
 * @returns {!Array.<ZxPort>}
 */
function arbitraryPorts(n) {
    let result = [];
    for (let k = 0; k < n; k++) {
        result.push(new ZxPort(ZxEdge.makeVerticalUnit(k, 0), new ZxNode(k, 0)));
    }
    return result;
}

suite.test('contracted', () => {
    let [a1, a2, b1, b2] = arbitraryPorts(4);
    let a = new Tensor(Matrix.col(1, 2, 3, 4), [a1, a2]);
    let b = new Tensor(Matrix.col(2, 3, 5, 7), [b1, b2]);
    assertThat(a.contracted(a2, b, b1)).isEqualTo(new Tensor(
        Matrix.col(11, 16, 26, 38),
        [a1, b2]
    ));
    assertThat(a.contracted(a1, b, b2)).isEqualTo(new Tensor(
        Matrix.col(12, 26, 17, 37),
        [a2, b1]
    ));
    assertThat(a.contracted(a1, a, a2)).isEqualTo(new Tensor(
        Matrix.solo(5),
        []
    ));
});

suite.test('inline_applyMatrixToPort', () => {
    let [a, b] = arbitraryPorts(2);
    let t = new Tensor(Matrix.col(1, 0, 0, 0), [a, b]);
    let h = Matrix.square(1, 1, 1, -1);
    let z = Matrix.square(1, 0, 0, -1);
    t.inline_applyMatrixToPort(h, a);
    assertThat(t.data).isEqualTo(Matrix.col(1, 1, 0, 0));
    t.inline_applyMatrixToPort(h, b);
    assertThat(t.data).isEqualTo(Matrix.col(1, 1, 1, 1));
    t.inline_applyMatrixToPort(z, b);
    assertThat(t.data).isEqualTo(Matrix.col(1, 1, -1, -1));
    t.inline_applyMatrixToPort(h, a);
    assertThat(t.data).isEqualTo(Matrix.col(2, 0, -2, -0));
    t.inline_applyMatrixToPort(h, b);
    assertThat(t.data).isEqualTo(Matrix.col(0, 0, 4, -0));
});

suite.test('inline_reorderPorts', () => {
    let [a, b, c] = arbitraryPorts(3);
    let t = new Tensor(Matrix.col(0, 1, 2, 3, 4, 5, 6, 7), [a, b, c]);

    t.inline_reorderPorts([c, b, a]);
    assertThat(t).isEqualTo(new Tensor(
        Matrix.col(0, 4, 2, 6, 1, 5, 3, 7),
        [c, b, a]));

    t.inline_reorderPorts([a, c, b]);
    assertThat(t).isEqualTo(new Tensor(
        Matrix.col(0, 1, 4, 5, 2, 3, 6, 7),
        [a, c, b]));
});
