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

import {Suite, assertThat, assertThrows, assertTrue} from "test/TestUtil.js"
import {GeneralMap} from "src/base/GeneralMap.js"
import {GeneralSet} from "src/base/GeneralSet.js"

import {CliffordRotation, X_AXIS, Z_AXIS, Y_AXIS} from "src/sim/CliffordRotation.js"
import {Matrix} from "src/base/Matrix.js";
import {Complex} from "src/base/Complex.js";
import {seq} from "src/base/Seq.js";

let suite = new Suite("CliffordRotation");


/**
 * @param {!Matrix} actual
 * @param {!Matrix} expected
 * @param {*} ctx Debug information for error messages.
 */
function assertApproxEqualUpToGlobalPhase(actual, expected, ctx=undefined) {
    let matched = actual.phaseMatchedTo(expected);
    assertThat(matched).withInfo({actual, ctx}).isApproximatelyEqualTo(expected);
}

/**
 * @param {!Matrix} state
 * @returns {!string}
 */
function pureStateToStab(state) {
    if (state.width() !== 1 || state.height() !== 2) {
        throw new Error(`Bad shape: ${state}`);
    }
    let a = state.cell(0, 0);
    let b = state.cell(0, 1);
    if (a.abs() < 0.00001) {
        return '-Z';
    }
    if (b.abs() < 0.00001) {
        return '+Z';
    }
    if (a.minus(b).abs() < 0.00001) {
        return '+X';
    }
    if (a.plus(b).abs() < 0.00001) {
        return '-X';
    }
    if (a.minus(b.times(Complex.I.neg())).abs() < 0.00001) {
        return '+Y';
    }
    if (a.minus(b.times(Complex.I)).abs() < 0.00001) {
        return '-Y';
    }
    throw new Error('Not a stabilizer state.');
}

/**
 * @param {!int} axis
 * @param {!int} sign
 * @returns {!string}
 */
function axisSignToStab(axis, sign) {
    return (sign === -1 ? '-' : '+') + 'XZY'[axis];
}

suite.test('y', () => {
    assertThat(CliffordRotation.X.y_axis).isEqualTo(Y_AXIS);
    assertThat(CliffordRotation.Y.y_axis).isEqualTo(Y_AXIS);
    assertThat(CliffordRotation.Z.y_axis).isEqualTo(Y_AXIS);
    assertThat(CliffordRotation.H.y_axis).isEqualTo(Y_AXIS);
    assertThat(CliffordRotation.S.y_axis).isEqualTo(X_AXIS);
    assertThat(new CliffordRotation(Y_AXIS, +1, X_AXIS, -1).y_axis).isEqualTo(Z_AXIS);

    assertThat(CliffordRotation.X.y_sign).isEqualTo(-1);
    assertThat(CliffordRotation.Y.y_sign).isEqualTo(+1);
    assertThat(CliffordRotation.Z.y_sign).isEqualTo(-1);
    assertThat(CliffordRotation.H.y_sign).isEqualTo(-1);
    assertThat(CliffordRotation.S.y_sign).isEqualTo(-1);

    // Validate versus matrix.
    let yPlus = Matrix.col(1, Complex.I).times(Math.sqrt(0.5));
    for (let clifford of CliffordRotation.all()) {
        let yOut = clifford.matrix().times(yPlus);
        assertThat(pureStateToStab(yOut)).
            withInfo({clifford}).
            isEqualTo(axisSignToStab(clifford.y_axis, clifford.y_sign));
    }
});

suite.test('times', () => {
    assertThat(CliffordRotation.X.square()).isEqualTo(CliffordRotation.I);
    assertThat(CliffordRotation.Y.square()).isEqualTo(CliffordRotation.I);
    assertThat(CliffordRotation.Z.square()).isEqualTo(CliffordRotation.I);
    assertThat(CliffordRotation.H.square()).isEqualTo(CliffordRotation.I);
    assertThat(CliffordRotation.S.square()).isEqualTo(CliffordRotation.Z);

    assertThat(CliffordRotation.H.times(CliffordRotation.Z).isEqualTo(CliffordRotation.Y.sqrt()));
    assertThat(CliffordRotation.X.times(CliffordRotation.H).isEqualTo(CliffordRotation.Y.sqrt()));

    // Validate versus matrix.
    for (let left of CliffordRotation.all()) {
        for (let right of CliffordRotation.all()) {
            let product = left.times(right);
            assertApproxEqualUpToGlobalPhase(
                product.matrix(),
                left.matrix().times(right.matrix()),
                {left, right, product});
        }
    }
});

suite.test('sqrt', () => {
    for (let clifford of CliffordRotation.all()) {
        let square = clifford.square();
        let sqrt = square.sqrt();
        assertThat(sqrt.square()).withInfo({sqrt, square}).isEqualTo(square);
    }
});

suite.test('allSqrts', () => {
    for (let sqrt of CliffordRotation.all()) {
        let square = sqrt.square();
        let allSqrts = square.allSqrts();
        assertThat(seq(allSqrts).any(e => e.isEqualTo(sqrt))).withInfo({sqrt, square, allSqrts}).isEqualTo(true);
    }
});

suite.test('inv_versus_inv_and_times_and_matrix', () => {
    assertThat(CliffordRotation.I.inv()).isEqualTo(CliffordRotation.I);
    assertThat(CliffordRotation.X.inv()).isEqualTo(CliffordRotation.X);
    assertThat(CliffordRotation.Y.inv()).isEqualTo(CliffordRotation.Y);
    assertThat(CliffordRotation.Z.inv()).isEqualTo(CliffordRotation.Z);
    assertThat(CliffordRotation.Hxy.inv()).isEqualTo(CliffordRotation.Hxy);
    assertThat(CliffordRotation.Hxz.inv()).isEqualTo(CliffordRotation.Hxz);
    assertThat(CliffordRotation.Hyz.inv()).isEqualTo(CliffordRotation.Hyz);
    assertThat(CliffordRotation.S.inv()).isEqualTo(new CliffordRotation(Y_AXIS, -1, Z_AXIS, +1));

    for (let clifford of CliffordRotation.all()) {
        let inv = clifford.inv();

        // Validate inverse inverse is original.
        assertThat(inv.inv()).withInfo({clifford}).isEqualTo(clifford);

        // Validate versus times.
        assertThat(inv.times(clifford)).withInfo({clifford}).isEqualTo(CliffordRotation.I);
        assertThat(clifford.times(inv)).withInfo({clifford}).isEqualTo(CliffordRotation.I);

        // Validate versus matrix.
        assertApproxEqualUpToGlobalPhase(clifford.matrix(), inv.matrix().adjoint(), {clifford, inv});
    }
});

suite.test('matrix', () => {
    let i = Complex.I;
    let ni = i.neg();
    let s = Math.sqrt(0.5);
    let si = new Complex(0, s);
    let nsi = new Complex(0, -s);

    assertApproxEqualUpToGlobalPhase(CliffordRotation.XyzCycle.matrix(), Matrix.square(s, nsi, s, si));

    assertApproxEqualUpToGlobalPhase(CliffordRotation.X.matrix(), Matrix.square(0, 1, 1, 0));
    assertApproxEqualUpToGlobalPhase(CliffordRotation.Y.matrix(), Matrix.square(0, ni, i, 0));
    assertApproxEqualUpToGlobalPhase(CliffordRotation.Z.matrix(), Matrix.square(1, 0, 0, -1));

    assertApproxEqualUpToGlobalPhase(CliffordRotation.Hxz.matrix(), Matrix.square(s, s, s, -s));
    assertApproxEqualUpToGlobalPhase(CliffordRotation.Hyz.matrix(), Matrix.square(s, nsi, si, -s));
    assertApproxEqualUpToGlobalPhase(CliffordRotation.Hxy.matrix(), Matrix.square(
        0, new Complex(s, -s),
        new Complex(s, s), 0));

    assertApproxEqualUpToGlobalPhase(CliffordRotation.X.sqrt().matrix(), Matrix.square(
        new Complex(0.5, 0.5), new Complex(0.5, -0.5),
        new Complex(0.5, -0.5), new Complex(0.5, 0.5)));
    assertApproxEqualUpToGlobalPhase(CliffordRotation.Y.sqrt().matrix(), Matrix.square(
        new Complex(0.5, 0.5), new Complex(-0.5, -0.5),
        new Complex(0.5, 0.5), new Complex(0.5, 0.5),
    ));
    assertApproxEqualUpToGlobalPhase(CliffordRotation.Z.sqrt().matrix(), Matrix.square(1, 0, 0, i));
});
