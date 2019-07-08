import {Suite, assertThat, assertThrows, assertTrue} from "test/TestUtil.js"
import {ZxGraph, ZxNode, ZxEdge, ZxPort} from "src/sim/ZxGraph.js"
import {Matrix} from "src/base/Matrix.js"
import {Complex} from "src/base/Complex.js"
import {PauliProduct} from "src/sim/PauliProduct.js"

import {zBasisEqualityMatrix, xBasisEqualityMatrix} from "src/sim/ZxNodeKind.js"


let suite = new Suite("ZxNodeKind");


suite.test("zBasisEqualityTensor", () => {
    assertThat(zBasisEqualityMatrix(0, 0)).isApproximatelyEqualTo(Matrix.square(2));
    assertThat(zBasisEqualityMatrix(0, 1)).isApproximatelyEqualTo(Matrix.col(1, 1));
    assertThat(zBasisEqualityMatrix(1, 1)).isApproximatelyEqualTo(Matrix.square(1, 0, 0, 1));
    assertThat(zBasisEqualityMatrix(2, 3)).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 1],
    ]));
    let zero3 = Matrix.col(1, 0, 0, 0, 0, 0, 0, 0);
    let zero2 = Matrix.col(1, 0, 0, 0);
    let one3 = Matrix.col(0, 0, 0, 0, 0, 0, 0, 1);
    let one2 = Matrix.col(0, 0, 0, 1);
    assertThat(zBasisEqualityMatrix(3, 2).times(zero3)).isApproximatelyEqualTo(zero2);
    assertThat(zBasisEqualityMatrix(3, 2).times(one3)).isApproximatelyEqualTo(one2);
});

suite.test("zBasisEqualityTensor_phased", () => {
    assertThat(zBasisEqualityMatrix(0, 0, 0)).isEqualTo(Matrix.col(2));
    assertThat(zBasisEqualityMatrix(0, 0, Math.PI/2)).isEqualTo(Matrix.col(new Complex(1, 1)));
    assertThat(zBasisEqualityMatrix(0, 0, Math.PI)).isEqualTo(Matrix.col(0));
    assertThat(zBasisEqualityMatrix(0, 0, -Math.PI/2)).isEqualTo(Matrix.col(new Complex(1, -1)));

    assertThat(zBasisEqualityMatrix(0, 1, 0)).isEqualTo(Matrix.col(1, 1));
    assertThat(zBasisEqualityMatrix(0, 1, Math.PI/2)).isEqualTo(Matrix.col(1, Complex.I));
    assertThat(zBasisEqualityMatrix(0, 1, Math.PI)).isEqualTo(Matrix.col(1, -1));
    assertThat(zBasisEqualityMatrix(0, 1, -Math.PI/2)).isEqualTo(Matrix.col(1, Complex.I.neg()));
});

suite.test("xBasisEqualityTensor", () => {
    assertThat(xBasisEqualityMatrix(0, 0)).isApproximatelyEqualTo(Matrix.square(2));
    assertThat(xBasisEqualityMatrix(0, 1)).isApproximatelyEqualTo(Matrix.col(Math.sqrt(2), 0));
    assertThat(xBasisEqualityMatrix(1, 1)).isApproximatelyEqualTo(Matrix.square(1, 0, 0, 1));
    assertThat(xBasisEqualityMatrix(2, 3)).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 0, 0, 1],
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [1, 0, 0, 1],
        [0, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [0, 1, 1, 0],
    ]).times(Math.sqrt(1/8)));
    let plus4 = Matrix.col(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1).times(0.25);
    let plus3 = Matrix.col(1, 1, 1, 1, 1, 1, 1, 1).times(Math.sqrt(1/8));
    let plus2 = Matrix.col(0.5, 0.5, 0.5, 0.5);
    let minus4 = Matrix.col(1, -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1, -1, -1, 1).times(0.25);
    let minus3 = Matrix.col(1, -1, -1, 1, -1, 1, 1, -1).times(Math.sqrt(1/8));
    let minus2 = Matrix.col(0.5, -0.5, -0.5, 0.5);
    assertThat(xBasisEqualityMatrix(3, 2).times(plus3)).isApproximatelyEqualTo(plus2);
    assertThat(xBasisEqualityMatrix(3, 2).times(minus3)).isApproximatelyEqualTo(minus2);
    assertThat(xBasisEqualityMatrix(4, 3).times(plus4)).isApproximatelyEqualTo(plus3);
    assertThat(xBasisEqualityMatrix(4, 3).times(minus4)).isApproximatelyEqualTo(minus3);
    assertThat(xBasisEqualityMatrix(4, 2).times(plus4)).isApproximatelyEqualTo(plus2);
    assertThat(xBasisEqualityMatrix(4, 2).times(minus4)).isApproximatelyEqualTo(minus2);
    assertThat(xBasisEqualityMatrix(2, 4).times(plus2)).isApproximatelyEqualTo(plus4);
    assertThat(xBasisEqualityMatrix(2, 4).times(minus2)).isApproximatelyEqualTo(minus4);
});

suite.test("xBasisEqualityTensor_phased", () => {
    assertThat(xBasisEqualityMatrix(0, 0, 0)).isApproximatelyEqualTo(
        Matrix.col(2));
    assertThat(xBasisEqualityMatrix(0, 0, Math.PI/2)).isApproximatelyEqualTo(
        Matrix.col(new Complex(1, 1)));
    assertThat(xBasisEqualityMatrix(0, 0, Math.PI)).isApproximatelyEqualTo(
        Matrix.col(0));
    assertThat(xBasisEqualityMatrix(0, 0, -Math.PI/2)).isApproximatelyEqualTo(
        Matrix.col(new Complex(1, -1)));

    let s = Math.sqrt(0.5);
    assertThat(xBasisEqualityMatrix(0, 1, 0)).isApproximatelyEqualTo(
        Matrix.col(Math.sqrt(2), 0));
    assertThat(xBasisEqualityMatrix(0, 1, Math.PI/2)).isApproximatelyEqualTo(
        Matrix.col(new Complex(s, s), new Complex(s, -s)));
    assertThat(xBasisEqualityMatrix(0, 1, Math.PI)).isApproximatelyEqualTo(
        Matrix.col(0, Math.sqrt(2)));
    assertThat(xBasisEqualityMatrix(0, 1, -Math.PI/2)).isApproximatelyEqualTo(
        Matrix.col(new Complex(s, -s), new Complex(s, s)));
});
