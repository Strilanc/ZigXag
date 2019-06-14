import {Suite, assertThat, EqualsTester} from "test/TestUtil.js"

import {PauliProduct, _pauli_product_phase} from "src/sim/PauliProduct.js"
import {Complex} from "src/base/Complex.js"
import {QubitAxis} from "src/sim/PauliProduct.js";

let suite = new Suite("PauliProduct");

suite.test('init_equal', () => {
    let m = new PauliProduct(1, new Uint8Array([0, 1, 2, 3]));
    assertThat(m.phase_exponent).isEqualTo(1);
    assertThat(m.paulis).isEqualTo(new Uint8Array([0, 1, 2, 3]));
    assertThat(m).isEqualTo(m);
    assertThat(m).isEqualTo(PauliProduct.fromString('+i.XZY'));
    assertThat(m).isNotEqualTo(PauliProduct.fromString('+.XZY'));
    assertThat(m).isNotEqualTo(PauliProduct.fromString('+i.YZY'));
    assertThat(m.toString()).isEqualTo('+i.XZY')
});

suite.test('fromString', () => {
    let rounds = [
        '+',
        '-',
        '+i',
        '-i',
        '+X',
        '+.XYZ..X',
        '-Y',
    ];
    for (let r of rounds) {
        assertThat(PauliProduct.fromString(r).toString()).isEqualTo(r);
    }

    assertThat(PauliProduct.fromString('')).isEqualTo(PauliProduct.fromString('+'));
    assertThat(PauliProduct.fromString('iX')).isEqualTo(PauliProduct.fromString('+iX'));
    assertThat(PauliProduct.fromString('X')).isEqualTo(PauliProduct.fromString('X'));
});

suite.test('fromSparse', () => {
    assertThat(PauliProduct.fromSparse(10, {5: 'X', 7: 2})).isEqualTo(PauliProduct.fromString('.....X.Z..'));
});

suite.test('fromSparseQubitAxes', () => {
    assertThat(PauliProduct.fromSparseQubitAxes(10, [
        new QubitAxis(5, true),
        new QubitAxis(5, true),
        new QubitAxis(2, false),
        new QubitAxis(4, true),
        new QubitAxis(7, false),
        new QubitAxis(7, true),
    ])).isEqualTo(PauliProduct.fromString('-i..X.Z..Y..'));
    assertThat(PauliProduct.fromSparseQubitAxes(5, [
        new QubitAxis(2, true),
        new QubitAxis(2, false),
    ])).isEqualTo(PauliProduct.fromString('i..Y..'));
});

suite.test('activeQubitAxes', () => {
    assertThat(PauliProduct.fromString('-.XYZ').activeQubitAxes()).isEqualTo([
        new QubitAxis(1, false),
        new QubitAxis(2, false),
        new QubitAxis(2, true),
        new QubitAxis(3, true),
    ]);
});

suite.test('slice', () => {
    assertThat(PauliProduct.fromString('-XYZ').slice(1)).isEqualTo(PauliProduct.fromString('-YZ'));
    assertThat(PauliProduct.fromString('-XYZ').slice(1, 2)).isEqualTo(PauliProduct.fromString('-Y'));
});

suite.test('xzBitWeight', () => {
    assertThat(PauliProduct.fromString('-....X....').xzBitWeight()).isEqualTo(1);
    assertThat(PauliProduct.fromString('-....Y....').xzBitWeight()).isEqualTo(2);
    assertThat(PauliProduct.fromString('-....Z....').xzBitWeight()).isEqualTo(1);
    assertThat(PauliProduct.fromString('-..X.Z..Y.').xzBitWeight()).isEqualTo(4);
});

suite.test('fromSparseByType', () => {
    assertThat(PauliProduct.fromSparseByType(10, {X: [2, 3], Y: [6]})).isEqualTo(PauliProduct.fromString('..XX..Y...'));
    assertThat(PauliProduct.fromSparseByType(10, {X: [2, 3], Y: 6})).isEqualTo(PauliProduct.fromString('..XX..Y...'));
});

suite.test('times', () => {
    assertThat(PauliProduct.fromString('XXXX').times(PauliProduct.fromString('.XYZ'))).isEqualTo(
        PauliProduct.fromString('X.ZY'));
    assertThat(PauliProduct.fromString('X').times(PauliProduct.fromString('Y'))).isEqualTo(
        PauliProduct.fromString('iZ'));
    assertThat(PauliProduct.fromString('XXX').times(PauliProduct.fromString('Y'))).isEqualTo(
        PauliProduct.fromString('iZXX'));
    assertThat(PauliProduct.fromString('Y').times(PauliProduct.fromString('ZZZ'))).isEqualTo(
        PauliProduct.fromString('iXZZ'));
    assertThat(PauliProduct.fromString('X').times(-1)).isEqualTo(
        PauliProduct.fromString('-X'));
    assertThat(PauliProduct.fromString('iX').times(Complex.I)).isEqualTo(
        PauliProduct.fromString('-X'));

    assertThat(PauliProduct.fromString('-.Z....Z.Z.').times(PauliProduct.fromString('-.Z........'))).isEqualTo(
        PauliProduct.fromString('+......Z.Z.'));
    assertThat(PauliProduct.fromString('XXXX').times(new QubitAxis(2, true))).isEqualTo(
        PauliProduct.fromString('-iXXYX'));
});

suite.test('bitwiseAnd', () => {
    assertThat(PauliProduct.fromString('.XYZ').bitwiseAnd(PauliProduct.fromString('XXXX'))).isEqualTo(
        PauliProduct.fromString('.XX.'));
    assertThat(PauliProduct.fromString('ZZZZ').bitwiseAnd(PauliProduct.fromString('.XYZ'))).isEqualTo(
        PauliProduct.fromString('..ZZ'));
    assertThat(PauliProduct.fromString('.XYZ').bitwiseAnd(PauliProduct.fromString('YYY'))).isEqualTo(
        PauliProduct.fromString('.XY'));

    assertThat(PauliProduct.fromString('+X').bitwiseAnd(PauliProduct.fromString('+X'))).isEqualTo(
        PauliProduct.fromString('+X'));
    assertThat(PauliProduct.fromString('-X').bitwiseAnd(PauliProduct.fromString('+X'))).isEqualTo(
        PauliProduct.fromString('+X'));
    assertThat(PauliProduct.fromString('+X').bitwiseAnd(PauliProduct.fromString('-X'))).isEqualTo(
        PauliProduct.fromString('+X'));
    assertThat(PauliProduct.fromString('-X').bitwiseAnd(PauliProduct.fromString('-X'))).isEqualTo(
        PauliProduct.fromString('-X'));
    assertThat(PauliProduct.fromString('iX').bitwiseAnd(PauliProduct.fromString('X'))).isEqualTo(
        PauliProduct.fromString('X'));
    assertThat(PauliProduct.fromString('iX').bitwiseAnd(PauliProduct.fromString('iX'))).isEqualTo(
        PauliProduct.fromString('iX'));
});

suite.test('_pauli_product_phase', () => {
    let paulis = [0, 1, 3, 2];
    let expected = [
        [0, 0, 0, 0],
        [0, 0, 1, -1],
        [0, -1, 0, 1],
        [0, 1, -1, 0],
    ];
    assertThat(_pauli_product_phase(1, 3)).isEqualTo(1);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            assertThat(_pauli_product_phase(paulis[i], paulis[j])).isEqualTo(expected[i][j]);
        }
    }
});

suite.test('gaussianEliminate', () => {
    assertThat(PauliProduct.gaussianEliminate([
        "+.X.X",
        "+Z.Z.",
        "+X.XX",
        "+ZZ.Z",
    ].map(PauliProduct.fromString))).isEqualTo([
        "+X.XX",
        "+Z.Z.",
        "+.X.X",
        "+.ZZZ",
    ].map(PauliProduct.fromString));

    assertThat(PauliProduct.gaussianEliminate([
        "+XXX",
        "+YYY",
    ].map(PauliProduct.fromString))).isEqualTo([
        "+XXX",
        "+iZZZ",
    ].map(PauliProduct.fromString));

    assertThat(PauliProduct.gaussianEliminate([
        "+XXXX",
        "+X...",
        "+..ZZ",
        "+.ZZ.",
    ].map(PauliProduct.fromString))).isEqualTo([
        "+X...",
        "+.XXX",
        "+.Z.Z",
        "+..ZZ",
    ].map(PauliProduct.fromString));
});
