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
import {BitTable} from "src/sim/BitTable.js"

let suite = new Suite("BitTable");

suite.test("isEqualTo", () => {
    let b = BitTable.zeros(2, 3);
    assertThat(b.buf).isEqualTo(new Uint8Array(6));
    assertThat(b.w).isEqualTo(2);
    assertThat(b.h).isEqualTo(3);

    assertThat(b.copy() !== b);
    let groups = [
        [b, BitTable.zeros(2, 3), b.copy()],
        [BitTable.zeros(3, 2)],
        [
            new BitTable(new Uint8Array([
                1, 1,
                0, 1,
                0, 0,]), 2, 3),
            BitTable.fromRows([1, 1], [0, 1], [0, 0])
        ],
        ['test'],
    ];

    for (let g1 of groups) {
        for (let g2 of groups) {
            for (let e1 of g1) {
                for (let e2 of g2) {
                    if (g1 === g2) {
                        assertThat(e1).isEqualTo(e2);
                    } else {
                        assertThat(e1).isNotEqualTo(e2);
                    }
                }
            }
        }
    }
});

suite.test("toString", () => {
    let b = BitTable.zeros(3, 2);
    assertThat(b.toString()).isEqualTo('000\n000');

    let b2 = new BitTable(new Uint8Array([
        1, 1,
        0, 1,
        0, 0,]), 2, 3);
    assertThat(b2.toString()).isEqualTo('11\n01\n00');
});


suite.test("gaussianEliminatedMod2", () => {
    assertThat(
        BitTable.fromRows(
            [1, 1, 1, 0],
            [1, 0, 1, 1],
            [0, 1, 1, 1]
        ).gaussianEliminatedMod2()
    ).isEqualTo(
        BitTable.fromRows(
            [1, 0, 0, 1],
            [0, 1, 0, 1],
            [0, 0, 1, 0]
        )
    );

    assertThat(
        BitTable.fromRows(
            [1, 0, 1, 1],
            [1, 1, 1, 0],
            [0, 1, 0, 1],
        ).gaussianEliminatedMod2()
    ).isEqualTo(
        BitTable.fromRows(
            [1, 0, 1, 1],
            [0, 1, 0, 1],
            [0, 0, 0, 0],
        )
    );

    assertThat(
        BitTable.fromRows(
            [1, 0, 1, 1],
            [1, 0, 1, 1],
            [1, 1, 1, 0],
            [0, 1, 0, 1],
        ).gaussianEliminatedMod2()
    ).isEqualTo(
        BitTable.fromRows(
            [1, 0, 1, 1],
            [0, 1, 0, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        )
    );
});



suite.test("ixor_row", () => {
    let b = BitTable.fromRows(
        [0, 0, 0, 0],
        [1, 1, 0, 0],
        [1, 0, 1, 0],
        [1, 1, 1, 1],
    );
    b.ixorRowToFrom(1, 2);
    assertThat(b).isEqualTo(BitTable.fromRows(
        [0, 0, 0, 0],
        [0, 1, 1, 0],
        [1, 0, 1, 0],
        [1, 1, 1, 1],
    ));
});


suite.test("row", () => {
    let b = BitTable.fromRows(
        [0, 0, 0, 0],
        [1, 1, 0, 0],
        [1, 0, 1, 0],
        [1, 1, 1, 1],
    );
    assertThat(b.row(0)).isEqualTo(new Uint8Array([0, 0, 0, 0]));
    assertThat(b.row(1)).isEqualTo(new Uint8Array([1, 1, 0, 0]));
});




suite.test("col", () => {
    let b = BitTable.fromRows(
        [0, 0, 0, 0],
        [1, 1, 0, 0],
        [1, 0, 1, 0],
        [1, 1, 1, 1],
    );
    assertThat(b.col(0)).isEqualTo(new Uint8Array([0, 1, 1, 1]));
    assertThat(b.col(1)).isEqualTo(new Uint8Array([0, 1, 0, 1]));
});


suite.test("get", () => {
    let b = BitTable.fromRows(
        [0, 0, 0, 0],
        [1, 1, 0, 0],
        [1, 0, 1, 0],
        [1, 1, 1, 1],
    );
    assertThat(b.get(0, 0)).isEqualTo(false);
    assertThat(b.get(1, 0)).isEqualTo(true);
    assertThat(b.get(1, 1)).isEqualTo(true);
    assertThat(b.get(0, 1)).isEqualTo(false);
    assertThat(b.get(2, 0)).isEqualTo(true);
    assertThat(b.get(2, 1)).isEqualTo(false);
});


suite.test("set", () => {
    let b = BitTable.fromRows(
        [0, 0, 0, 0],
        [1, 1, 0, 0],
        [1, 0, 1, 0],
        [1, 1, 1, 1],
    );
    b.set(1, 2, true);
    b.set(3, 3, false);
    assertThat(b).isEqualTo(BitTable.fromRows(
        [0, 0, 0, 0],
        [1, 1, 1, 0],
        [1, 0, 1, 0],
        [1, 1, 1, 0],
    ));
});
