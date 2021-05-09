import {Suite, assertThat, assertThrows, assertTrue, assertFalse} from "test/TestUtil.js"
import {SimpleZxGraph, SimpleZxNode, _find_all_edges, _find_end_of_edge, _find_nodes, _text_to_char_map} from "src/sim/SimpleZxGraph.js"
import {stim} from "src/ext/stim.js";

let suite = new Suite("SimpleZxGraph");

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
        nodes: [new SimpleZxNode('X')]});
    assertThat(_find_nodes(_text_to_char_map('\n   X'))).isEqualTo({
        node_ids: new Map([
            ['3,1', 0]
        ]),
        nodes: [new SimpleZxNode('X')]});
    assertThat(_find_nodes(_text_to_char_map('X(pi)'))).isEqualTo({
        node_ids: new Map([
            ['0,0', 0],
            ['1,0', 0],
            ['2,0', 0],
            ['3,0', 0],
            ['4,0', 0],
        ]),
        nodes: [new SimpleZxNode('X', 2)]});
    assertThat(_find_nodes(_text_to_char_map('X--Z'))).isEqualTo({
        node_ids: new Map([
            ['0,0', 0],
            ['3,0', 1],
        ]),
        nodes: [
            new SimpleZxNode('X'),
            new SimpleZxNode('Z'),
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
            new SimpleZxNode('X'),
            new SimpleZxNode('Z'),
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
            new SimpleZxNode('X', 2),
            new SimpleZxNode('Z'),
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
    assertThat(SimpleZxGraph.from_text_diagram(`
in---Z---H---------out
     |
in---X---Z(-pi/2)---out
    `)).isEqualTo(new SimpleZxGraph(
        [
            new SimpleZxNode('in'),
            new SimpleZxNode('Z'),
            new SimpleZxNode('H'),
            new SimpleZxNode('out'),
            new SimpleZxNode('in'),
            new SimpleZxNode('X'),
            new SimpleZxNode('Z', 3),
            new SimpleZxNode('out'),
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

    assertThat(SimpleZxGraph.from_text_diagram(`
       Z-*
       | |
       X-*
    `)).isEqualTo(new SimpleZxGraph(
        [
            new SimpleZxNode('Z'),
            new SimpleZxNode('X'),
        ],
        [
            [0, 1],
            [0, 1],
        ]
    ));
});

suite.test('stabilizers', () => {
    assertThat(SimpleZxGraph.from_text_diagram(`
in---Z---out
     |
in---X---out
    `).stabilizers()).isEqualTo([
        new stim.PauliString("+X_XX").deleteLater(),
        new stim.PauliString("+Z_Z_").deleteLater(),
        new stim.PauliString("+_X_X").deleteLater(),
        new stim.PauliString("+_ZZZ").deleteLater(),
    ]);

    assertThat(SimpleZxGraph.from_text_diagram(`
in---Z(pi/2)---out
    `).stabilizers()).isEqualTo([
        new stim.PauliString("+XY").deleteLater(),
        new stim.PauliString("+ZZ").deleteLater(),
    ]);

    assertThat(SimpleZxGraph.from_text_diagram(`
in---Z(-pi/2)---out
    `).stabilizers()).isEqualTo([
        new stim.PauliString("-XY").deleteLater(),
        new stim.PauliString("+ZZ").deleteLater(),
    ]);

    assertThat(SimpleZxGraph.from_text_diagram(`
in---H---out
    `).stabilizers()).isEqualTo([
        new stim.PauliString("+XZ").deleteLater(),
        new stim.PauliString("+ZX").deleteLater(),
    ]);

    assertThat(SimpleZxGraph.from_text_diagram(`
in-H-X---out
     |
     *---out
    `).stabilizers()).isEqualTo([
        new stim.PauliString("+XZZ").deleteLater(),
        new stim.PauliString("+Z_X").deleteLater(),
        new stim.PauliString("+_XX").deleteLater(),
    ]);

    assertThat(SimpleZxGraph.from_text_diagram(`
out--X-H-in
     |
     *---out
    `).stabilizers()).isEqualTo([
        new stim.PauliString("+XZZ").deleteLater(),
        new stim.PauliString("+Z_X").deleteLater(),
        new stim.PauliString("+_XX").deleteLater(),
    ]);
});
