import {Suite, assertThat, assertThrows, assertTrue, assertFalse} from "test/TestUtil.js"
import {ZxGraphEdgeList, ZxType, ExternalStabilizer, _find_all_edges, _find_end_of_edge, _find_nodes, _text_to_char_map} from "src/sim/ZxGraphEdgeList.js"
import {stim} from "src/ext/stim.js";

let suite = new Suite("ZxGraphEdgeList");

suite.test('_text_to_char_map', () => {
    assertThat(_text_to_char_map(`
ABC DEF
G    
 HI
    `)).isEqualTo(new Map([
        ['0,1', [0, 1, 'A']],
        ['1,1', [1, 1, 'B']],
        ['2,1', [2, 1, 'C']],
        ['4,1', [4, 1, 'D']],
        ['5,1', [5, 1, 'E']],
        ['6,1', [6, 1, 'F']],
        ['0,2', [0, 2, 'G']],
        ['1,3', [1, 3, 'H']],
        ['2,3', [2, 3, 'I']],
    ]))
});

suite.test('_find_nodes', () => {
    assertThat(_find_nodes(_text_to_char_map(''))).isEqualTo({node_ids: new Map(), nodes: []});
    assertThrows(() => {
        _find_nodes(_text_to_char_map('not_a_node'))
    }).hasToStringContaining("Unrecognized");
    assertThrows(() => {
        _find_nodes(_text_to_char_map('X(run_off'))
    }).hasToStringContaining("')'");
    assertThat(_find_nodes(_text_to_char_map('X'))).isEqualTo({
        node_ids: new Map([
            ['0,0', 0]
        ]),
        nodes: [new ZxType('X')]});
    assertThat(_find_nodes(_text_to_char_map('\n   X'))).isEqualTo({
        node_ids: new Map([
            ['3,1', 0]
        ]),
        nodes: [new ZxType('X')]});
    assertThat(_find_nodes(_text_to_char_map('X(pi)'))).isEqualTo({
        node_ids: new Map([
            ['0,0', 0],
            ['1,0', 0],
            ['2,0', 0],
            ['3,0', 0],
            ['4,0', 0],
        ]),
        nodes: [new ZxType('X', 2)]});
    assertThat(_find_nodes(_text_to_char_map('X--Z'))).isEqualTo({
        node_ids: new Map([
            ['0,0', 0],
            ['3,0', 1],
        ]),
        nodes: [
            new ZxType('X'),
            new ZxType('Z'),
        ]});
    assertThat(_find_nodes(_text_to_char_map(`
X--*
  /
 Z
`))).isEqualTo({
        node_ids: new Map([
            ['0,1', 0],
            ['1,3', 1],
        ]),
        nodes: [
            new ZxType('X'),
            new ZxType('Z'),
        ]});
    assertThat(_find_nodes(_text_to_char_map(`
X(pi)--Z
`))).isEqualTo({
        node_ids: new Map([
            ['0,1', 0],
            ['1,1', 0],
            ['2,1', 0],
            ['3,1', 0],
            ['4,1', 0],
            ['7,1', 1],
        ]),
        nodes: [
            new ZxType('X', 2),
            new ZxType('Z'),
        ]});
});

suite.test('_find_end_of_edge', () => {
    let c = _text_to_char_map(String.raw`
1--------*
          \    2      |
     5     \      *--++-*
            *-----+-* |/
                  | | /
                  2 |/
                    *
    `);
    let terminal = new Map([['0,1', 'ONE'], ['18,6', 'TWO']])
    let seen = new Set();
    assertThat(_find_end_of_edge(1, 1, 1, 0, c, terminal, seen)).isEqualTo('TWO');
    assertThat(seen.size).isEqualTo(31);
});

suite.test('_find_all_edges', () => {
    let c = _text_to_char_map(String.raw`
X---Z      H----X(pi/2)
          /
       Z(pi/2)
    `);
    let {node_ids} = _find_nodes(c)
    assertThat(_find_all_edges(c, node_ids)).isEqualTo([
        [0, 1],
        [2, 3],
        [2, 4],
    ]);
});

suite.test('from_text_diagram', () => {
    assertThat(ZxGraphEdgeList.from_text_diagram(`
in---Z---H---------out
     |
in---X---Z(-pi/2)---out
    `)).isEqualTo(new ZxGraphEdgeList(
        [
            new ZxType('in'),
            new ZxType('Z'),
            new ZxType('H'),
            new ZxType('out'),
            new ZxType('in'),
            new ZxType('X'),
            new ZxType('Z', 3),
            new ZxType('out'),
        ],
        [
            [0, 1],
            [1, 2],
            [2, 3],
            [1, 5],
            [4, 5],
            [5, 6],
            [6, 7],
        ]
    ));

    assertThat(ZxGraphEdgeList.from_text_diagram(`
       Z-*
       | |
       X-*
    `)).isEqualTo(new ZxGraphEdgeList(
        [
            new ZxType('Z'),
            new ZxType('X'),
        ],
        [
            [0, 1],
            [0, 1],
        ]
    ));
});

suite.test('external_stabilizers', () => {
    assertThat(ZxGraphEdgeList.from_text_diagram(`
in---H---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "Z", +1),
        new ExternalStabilizer("Z", "X", +1),
    ]);

    assertThat(ZxGraphEdgeList.from_text_diagram(`
in---Z(-pi/2)---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "Y", -1),
        new ExternalStabilizer("Z", "Z", +1),
    ]);

    assertThat(ZxGraphEdgeList.from_text_diagram(`
in---Z---out
     |
in---X---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X_", "XX", +1),
        new ExternalStabilizer("Z_", "Z_", +1),
        new ExternalStabilizer("_X", "_X", +1),
        new ExternalStabilizer("_Z", "ZZ", +1),
    ]);

    assertThat(ZxGraphEdgeList.from_text_diagram(`
in---Z---out
     |
in---Z---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("ZZ", "__", +1),
        new ExternalStabilizer("XX", "XX", +1),
        new ExternalStabilizer("_Z", "_Z", +1),
        new ExternalStabilizer("__", "ZZ", +1),
    ]);

    assertThat(ZxGraphEdgeList.from_text_diagram(`
in---Z---Z---out
     |   |
in---X---X---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X_", "X_", +1),
        new ExternalStabilizer("Z_", "Z_", +1),
        new ExternalStabilizer("_X", "_X", +1),
        new ExternalStabilizer("_Z", "_Z", +1),
    ]);

    assertThat(ZxGraphEdgeList.from_text_diagram(`
in-H-X---out
     |
     *---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "ZZ", +1),
        new ExternalStabilizer("Z", "_X", +1),
        new ExternalStabilizer("_", "XX", +1),
    ]);

    assertThat(ZxGraphEdgeList.from_text_diagram(`
out--X-H-in
     |
     *---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "ZZ", +1),
        new ExternalStabilizer("Z", "_X", +1),
        new ExternalStabilizer("_", "XX", +1),
    ]);

    assertThat(ZxGraphEdgeList.from_text_diagram(`

        in---Z(pi/2)---out

    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "Y", +1),
        new ExternalStabilizer("Z", "Z", +1),
    ]);

    assertThat(ZxGraphEdgeList.from_text_diagram(`

                                  *-------------Z----------------Z-------Z(pi/2)
                                  |             |                |
            *-----------------Z---+-------------+---Z------------+-------Z(pi/2)
            |                 |   |             |   |            |
            X---X---Z(pi/2)   X---X---Z(pi/2)   X---X---Z(pi/2)  X---X---Z(pi/2)   *-----out
            |   |             |                 |                |   |            /
            *---+-------------Z-----------------+----------------+---Z---Z(pi/2) /
                |                               |                |              /
        in------Z-------------------------------Z---------------Z(pi)----------*

    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "Y", +1),
        new ExternalStabilizer("Z", "Z", +1),
    ]);


});
