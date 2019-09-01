import {Suite, fail, assertTrue, assertFalse, assertThat, assertThrows} from "test/TestUtil.js"

import {Node, Edge, Port, Graph} from "src/base/Graph.js"

let suite = new Suite("Graph");

suite.test("general", () => {
    let g = new Graph();
    assertThat(g.toJson()).isEqualTo({nodes: [], edges: []});

    let a = g.addNode('a');
    let b = g.addNode('b');
    assertThat(g.toJson()).isEqualTo({nodes: ['a', 'b'], edges: []});

    let e = a.addEdgeTo(b, 'e');
    assertThat(g.toJson()).isEqualTo({nodes: ['a', 'b'], edges: [{n1: 0, n2: 1, data: 'e'}]});

    a.del();
    assertThat(g.toJson()).isEqualTo({nodes: ['b'], edges: []});

    let a2 = g.addNode('a2');
    let e2 = a2.addEdgeTo(b, 'e2');
    let e3 = a2.addEdgeTo(b, 'e3');
    assertThat(g.toJson()).isEqualTo({
        nodes: ['b', 'a2'],
        edges: [{n1: 1, n2: 0, data: 'e2'}, {n1: 1, n2: 0, data: 'e3'}]
    });

    e2.del();
    assertThat(g.toJson()).isEqualTo({
        nodes: ['b', 'a2'],
        edges: [{n1: 1, n2: 0, data: 'e3'}]
    });

    e3.del();
    assertThat(g.toJson()).isEqualTo({
        nodes: ['b', 'a2'],
        edges: []
    });
});

suite.test("exploration_and_intersection", () => {
    let g = new Graph();
    let a = g.addNode('a');
    let b = g.addNode('b');
    let c = g.addNode('c');
    let d = g.addNode('d');

    let ab = a.addEdgeTo(b);
    let bc = b.addEdgeTo(c);
    let cd = c.addEdgeTo(d);
    let da = d.addEdgeTo(a);
    let ac = a.addEdgeTo(c);
    let ac2 = a.addEdgeTo(c);

    let pac = new Port(a, ac);
    let pca = new Port(c, ac);
    let pab = new Port(a, ab);
    let pcd = new Port(c, cd);
    let pda = new Port(c, da);

    assertThat(a.edges).isEqualTo([ab, da, ac, ac2]);
    assertThat(a.edgesTo(c)).isEqualTo([ac, ac2]);
    assertThrows(() => a.edgeTo(c));
    assertThat(b.edgeTo(c)).isEqualTo(bc);
    assertThat(b.portTo(c)).isEqualTo(new Port(b, bc));
    assertThat(b.portsTo(c)).isEqualTo([new Port(b, bc)]);
    assertThat(a.adjacentEdges()).isEqualTo([ab, da, ac, ac]);
    assertThat(a.adjacentNodes()).isEqualTo([b, d, c]);
    assertThat(b.adjacentNodes()).isEqualTo([a, c]);
    assertThat(b.adjacentEdges()).isEqualTo([ab, bc]);
    assertThat(a.degree).isEqualTo(4);
    assertThat(b.degree).isEqualTo(2);

    assertThat(ac.opposite(a)).isEqualTo(c);
    assertThat(ac.opposite(c)).isEqualTo(a);
    assertThrows(() => ac.opposite(d));
    assertThat(ac.adjacentNodes()).isEqualTo([a, c]);
    assertThat(ac.adjacentEdges()).isEqualTo([ab, da, ac2, bc, cd]);
    assertThat(bc.adjacentEdges()).isEqualTo([ab, cd, ac, ac2]);
    assertThat(ac.nodes).isEqualTo([a, c]);
    assertThat(ac.ports).isEqualTo([new Port(a, ac), new Port(c, ac)]);
    assertThat(ac.endsOn(a)).isEqualTo(true);
    assertThat(ac.endsOn(b)).isEqualTo(false);
    assertThat(ac.endsOn(c)).isEqualTo(true);

    // === INTERSECTIONS ===
    // A Node covers itself and touches its adjacent edges.
    // An Edge covers itself and touches its adjacent nodes.
    // A Port covers its node and its edge, and touches edges adjacent to its node, but doesn't touch its opposing node.

    // Node:Node.
    assertThat(a.intersection(a)).isEqualTo(a);
    assertThat(a.intersection(b)).isEqualTo(undefined);

    // Edge:Edge.
    assertThat(ac.intersection(bc)).isEqualTo(c);
    assertThat(da.intersection(bc)).isEqualTo(undefined);
    assertThat(ac.intersection(ac)).isEqualTo(ac);
    assertThat(ac.intersection(ac2)).isEqualTo([a, c]);

    // Port:Port.
    assertThat(pac.intersection(pac)).isEqualTo(pac);
    assertThat(pac.intersection(pca)).isEqualTo(ac); // Even though the edge's nodes are not in the intersection.
    assertThat(pab.intersection(pca)).isEqualTo(undefined);
    assertThat(pab.intersection(pcd)).isEqualTo(undefined);
    assertThat(pab.intersection(pda)).isEqualTo(undefined);
    assertThat(pab.intersection(pac)).isEqualTo(a);

    // Node:Edge.
    assertThat(a.intersection(ac)).isEqualTo(a);
    assertThat(c.intersection(ac)).isEqualTo(c);
    assertThat(a.intersection(bc)).isEqualTo(undefined);
    assertThat(ac.intersection(a)).isEqualTo(a);
    assertThat(ac.intersection(c)).isEqualTo(c);
    assertThat(bc.intersection(a)).isEqualTo(undefined);

    // Node:Port.
    assertThat(a.intersection(pac)).isEqualTo(a);
    assertThat(a.intersection(pca)).isEqualTo(undefined);
    assertThat(b.intersection(pac)).isEqualTo(undefined);
    assertThat(pac.intersection(a)).isEqualTo(a);
    assertThat(pca.intersection(a)).isEqualTo(undefined);
    assertThat(pac.intersection(b)).isEqualTo(undefined);

    // Edge:Port.
    assertThat(ac.intersection(pac)).isEqualTo(ac);
    assertThat(ac.intersection(pca)).isEqualTo(ac);
    assertThat(ac2.intersection(pac)).isEqualTo(a);
    assertThat(bc.intersection(pac)).isEqualTo(undefined);
    assertThat(bc.intersection(pca)).isEqualTo(c);
    assertThat(pac.intersection(ac)).isEqualTo(ac);
    assertThat(pca.intersection(ac)).isEqualTo(ac);
    assertThat(pac.intersection(ac2)).isEqualTo(a);
    assertThat(pac.intersection(bc)).isEqualTo(undefined);
    assertThat(pca.intersection(bc)).isEqualTo(c);
});

suite.test('contract_edge', () => {
    let g = new Graph();
    let a = g.addNode('a');
    let b = g.addNode('b');
    let e = a.addEdgeTo(b, 'e');
    let c = e.contract('c');
    assertTrue(a === c);
    assertThat(g.toJson()).isEqualTo({
        nodes: ['c'],
        edges: [],
    });

    let aa = a.addEdgeTo(a, 'self');
    aa.contract('d');
    assertThat(g.toJson()).isEqualTo({
        nodes: ['d'],
        edges: [],
    });
});

suite.test('contract_node', () => {
    let g = new Graph();
    let a = g.addNode('a');
    let b = g.addNode('b');
    let c = g.addNode('c');
    assertThrows(() => b.contract('!'));

    let ab = a.addEdgeTo(b);
    assertThrows(() => b.contract('!'));

    b.addEdgeTo(c);
    let ac = b.contract('!');
    assertTrue(ab === ac);
    assertThat(g.toJson()).isEqualTo({
        nodes: ['a', 'c'],
        edges: [{n1: 0, n2: 1, data: '!'}]
    });

    a.addEdgeTo(c, '2');
    let d = ac.contract('d');
    assertThat(g.toJson()).isEqualTo({
        nodes: ['d'],
        edges: [{n1: 0, n2: 0, data: '2'}]
    });

    assertThrows(() => d.contract('!'));
});

suite.test('contract_graph_equivalenceClass', () => {
    let g = new Graph();
    let a = g.addNode('black');
    let b = g.addNode('white');
    let c = g.addNode('black');
    a.addEdgeTo(b, 'ac');
    b.addEdgeTo(c, 'bc');
    c.addEdgeTo(a, 'ca');

    g.contract(e => e.node1.data === e.node2.data, e => e.node1.data);
    assertThat(g.toJson()).isEqualTo({
        nodes: ['white', 'black'],
        edges: [{n1: 1, n2: 0, data: 'ac'}, {n1: 0, n2: 1, data: 'bc'}]
    });
});

suite.test('contract_graph_deadNodes', () => {
    let g = new Graph();
    let a = g.addNode('a');
    let b = g.addNode('b');
    let c = g.addNode(undefined);
    let d = g.addNode(undefined);
    let e = g.addNode('e');
    a.addEdgeTo(b, 2);
    b.addEdgeTo(c, 3);
    c.addEdgeTo(a, 5);
    c.addEdgeTo(d, 7);
    d.addEdgeTo(e, 11);
    e.addEdgeTo(a, 13);

    g.contract(_ => false, _ => undefined, n => n.data === undefined, n => n._es[0].data + n._es[1].data);
    assertThat(g.toJson()).isEqualTo({
        nodes: ['a', 'b', undefined, 'e'],
        edges: [
            {n1: 0, n2: 1, data: 2},
            {n1: 2, n2: 0, data: 5},
            {n1: 3, n2: 0, data: 13},
            {n1: 1, n2: 2, data: 3},
            {n1: 2, n2: 3, data: 7 + 11},
        ]
    });
});
