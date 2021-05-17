import {Suite, assertThat, assertThrows, assertTrue, assertFalse} from "test/TestUtil.js"
import {text_diagram_to_edge_list, _find_all_edges, _find_end_of_edge, _find_nodes, _text_to_char_map} from "src/sim/text_diagram_to_graph.js"

let suite = new Suite("text_diagram_to_graph");

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
    assertThat(_find_nodes(_text_to_char_map('') )).isEqualTo({node_ids: new Map(), nodes: []});
    assertThat(_find_nodes(_text_to_char_map('X'), e => e + '!')).isEqualTo({
        node_ids: new Map([
            ['0,0', 0]
        ]),
        nodes: ['X!']});
    assertThat(_find_nodes(_text_to_char_map('X'))).isEqualTo({
        node_ids: new Map([
            ['0,0', 0]
        ]),
        nodes: ['X']});
    assertThat(_find_nodes(_text_to_char_map('\n   X'))).isEqualTo({
        node_ids: new Map([
            ['3,1', 0]
        ]),
        nodes: ['X']});
    assertThat(_find_nodes(_text_to_char_map('X(pi)'))).isEqualTo({
        node_ids: new Map([
            ['0,0', 0],
            ['1,0', 0],
            ['2,0', 0],
            ['3,0', 0],
            ['4,0', 0],
        ]),
        nodes: ['X(pi)']});
    assertThat(_find_nodes(_text_to_char_map('X--Z'))).isEqualTo({
        node_ids: new Map([
            ['0,0', 0],
            ['3,0', 1],
        ]),
        nodes: [
            'X',
            'Z',
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
            'X',
            'Z',
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
            'X(pi)',
            'Z',
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
    let [dx, dy] = _find_end_of_edge(1, 1, 1, 0, c, terminal);
    assertThat(terminal.get(`${dx},${dy}`)).isEqualTo('TWO');
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

suite.test('text_diagram_to_edge_list', () => {
    assertThat(text_diagram_to_edge_list("A---B")).isEqualTo({
        nodes: ['A', 'B'],
        edges: [
            [0, 1],
        ],
    });

    assertThat(text_diagram_to_edge_list("A---B", e => e + "!")).isEqualTo({
        nodes: ['A!', 'B!'],
        edges: [
            [0, 1],
        ],
    });

    assertThat(text_diagram_to_edge_list(`
        Z-*
        | |
        X-*
    `)).isEqualTo({
        nodes: ['Z', 'X'],
        edges: [
            [0, 1],
            [0, 1],
        ]
    });

    assertThat(text_diagram_to_edge_list(`
             D
            /
        A--------------B
          /
         /
        C
    `)).isEqualTo({
        nodes: ['D', 'A', 'B', 'C'],
        edges: [
            [0, 3],
            [1, 2],
        ]
    });

    assertThat(text_diagram_to_edge_list(`
             D
            /
        A--/-----------B
          /
         /
        C
    `)).isEqualTo({
        nodes: ['D', 'A', 'B', 'C'],
        edges: [
            [0, 3],
            [1, 2],
        ]
    });

    assertThat(text_diagram_to_edge_list(`
             D
             |
        A----|---------B
             |
             C
    `)).isEqualTo({
        nodes: ['D', 'A', 'B', 'C'],
        edges: [
            [0, 3],
            [1, 2],
        ]
    });

    assertThat(text_diagram_to_edge_list(`
        A-*
        | |
        *-*
    `)).isEqualTo({
        nodes: ['A'],
        edges: [
            [0, 0],
        ]
    });

    assertThat(text_diagram_to_edge_list(String.raw`
      *
      |\
      *-A-*
        | |
        *-*
    `)).isEqualTo({
        nodes: ['A'],
        edges: [
            [0, 0],
            [0, 0],
        ]
    });

    assertThat(text_diagram_to_edge_list(`
             D
             |
        A--------------B
             |
             C
    `)).isEqualTo({
        nodes: ['D', 'A', 'B', 'C'],
        edges: [
            [0, 3],
            [1, 2],
        ]
    });

    assertThat(text_diagram_to_edge_list(`
             D
             |
        A----+---------B
             |
             C
    `)).isEqualTo({
        nodes: ['D', 'A', 'B', 'C'],
        edges: [
            [0, 3],
            [1, 2],
        ]
    });

    assertThat(text_diagram_to_edge_list(`
             D
        A----+---------B
             C
    `)).isEqualTo({
        nodes: ['D', 'A', 'B', 'C'],
        edges: [
            [0, 3],
            [1, 2],
        ]
    });

    assertThat(text_diagram_to_edge_list(`
             D
            A+B
             C
    `)).isEqualTo({
        nodes: ['D', 'A', 'B', 'C'],
        edges: [
            [0, 3],
            [1, 2],
        ]
    });

    assertThat(text_diagram_to_edge_list(`
             D
            A|B
             C
    `)).isEqualTo({
        nodes: ['D', 'A', 'B', 'C'],
        edges: [
            [0, 3],
        ]
    });

    assertThat(text_diagram_to_edge_list(`
             D
            A-B
             C
    `)).isEqualTo({
        nodes: ['D', 'A', 'B', 'C'],
        edges: [
            [1, 2],
        ]
    });
});
