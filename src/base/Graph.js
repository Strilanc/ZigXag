/**
 * Adjacent edge list graph.
 */

import {describe} from "src/base/Describe.js";
import {equate} from "src/base/Equate.js";
import {seq} from "src/base/Seq.js";


/**
 * A graph node using reference identity and adjacency edge list representation.
 */
class Node {
    /**
     * @param {!Graph} parent
     * @param {!int} id
     * @param {*} data
     */
    constructor(parent, id, data) {
        this.parent = parent;
        this.data = data;
        this._id = id;
        this._es = /** @type {!Array.<!Edge>} */ [];
    }

    /**
     * @returns {!int}
     */
    get id() {
        return this._id;
    }

    /**
     * @returns {!Array.<!Edge>}
     */
    get edges() {
        return [...this._es];
    }

    /**
     * @returns {!Array.<!Port>}
     */
    get ports() {
        return this._es.map(e => new Port(this, e));
    }

    /**
     * @returns {!int}
     */
    get degree() {
        return this._es.length;
    }

    /**
     * @param {!Node} other
     * @param {*} edgeData
     * @returns {!Edge}
     */
    addEdgeTo(other, edgeData=undefined) {
        let edge = new Edge(this.parent._nextId++, this, other, edgeData);
        this._es.push(edge);
        other._es.push(edge);
        return edge;
    }

    del() {
        if (this.parent === undefined) {
            throw new Error(`Already deleted <${this}>.`);
        }
        for (let e of this.edges) {
            e.del();
        }

        let i = this.parent._ns.indexOf(this);
        if (i === -1) {
            throw new Error(`Bad state. Deleting node <${this}> but not found in graph.`);
        }
        this.parent._ns.splice(i, 1);
        this.parent = undefined;
    }

    /**
     * @param {!Node} other
     * @returns {!Array.<!Edge>}
     */
    edgesTo(other) {
        return this._es.filter(e => e.opposite(this) === other);
    }

    /**
     * @param {!Node} other
     * @returns {!Array.<!Port>}
     */
    portsTo(other) {
        return this.edgesTo(other).map(e => new Port(this, e));
    }

    /**
     * @param {!Node} other
     * @returns {!Edge}
     */
    edgeTo(other) {
        let results = this.edgesTo(other);
        if (results.length !== 1) {
            throw new Error(`${results.length} edges from <${this}> to <${other}>. Expected 1.`)
        }
        return results[0];
    }

    /**
     * @param {!Node} other
     * @returns {!Port}
     */
    portTo(other) {
        return new Port(this, this.edgeTo(other));
    }

    /**
     * @param {!Edge|!Node|!Port} element
     * @returns {undefined|!Node}
     */
    intersection(element) {
        if (element instanceof Node) {
            return this === element ? element : undefined;
        }

        if (element instanceof Edge || element instanceof Port) {
            return element.intersection(this);
        }

        throw new Error(`Unrecognized graph element: ${element}`);
    }

    /**
     * @returns {!Array.<!Node>}
     */
    adjacentNodes() {
        let result = [];
        let seen = new Set();
        for (let edge of this._es) {
            let n = edge.opposite(this);
            if (!seen.has(n)) {
                result.push(n);
                seen.add(n);
            }
        }
        return result;
    }

    /**
     * @returns {!Array.<!Node>}
     */
    adjacentEdges() {
        return this.edges;
    }

    /**
     * Contracts this node, merging its two distinct edges into one.
     *
     * The 'new' edge is an overwritten version of this node's first edge.
     * The other edge is deleted from the graph along with this node.
     *
     * @param {*} newEdgeData
     * @returns {!Edge} The merged edge.
     */
    contract(newEdgeData) {
        if (this.degree !== 2) {
            throw new Error(`Only degree 2 nodes can be contracted. Node: <${this}>.`);
        }
        if (this._es[0] === this._es[1]) {
            throw new Error(`Nodes with a self-loop cannot be contracted. Node: <${this}>.`);
        }
        let e = this._es[0];
        let n = this._es[1].opposite(this);
        e._switchNode(this, n);
        e.data = newEdgeData;
        this.del();
        return e;
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `Node(id=${this._id}, degree=${this._es.length}, data=<${this.data}>)`;
    }
}

/**
 * A graph edge using reference identity and adjacency edge list representation.
 */
class Edge {
    /**
     * @param {!Node} n1
     * @param {!Node} n2
     * @param {!int} id;
     * @param {*} data
     */
    constructor(id, n1, n2, data) {
        this._n1 = n1;
        this._n2 = n2;
        this._id = id;
        this.data = data;
    }

    /**
     * @returns {!int}
     */
    get id() {
        return this._id;
    }

    /**
     * @returns {!Array.<!Node>}
     */
    get nodes() {
        return [this._n1, this._n2];
    }

    /**
     * @returns {!Node}
     */
    get node1() {
        return this._n1;
    }

    /**
     * @returns {!Node}
     */
    get node2() {
        return this._n2;
    }

    /**
     * @returns {!Array.<!Port>}
     */
    get ports() {
        return [new Port(this._n1, this), new Port(this._n2, this)];
    }

    /**
     * @param {!Node} node
     * @returns {!Port}
     */
    portFrom(node) {
        if (!this.endsOn(node)) {
            throw new Error(`Node <${node}> is not an endpoint of <${this}>.`);
        }
        return new Port(node, this);
    }

    del() {
        this._removeFromNode(this._n1);
        this._removeFromNode(this._n2);
    }

    /**
     * @param {!Node} n
     * @private
     */
    _removeFromNode(n) {
        let i = n._es.indexOf(this);
        if (i === -1) {
            throw new Error(`Bad state. Deleting edge <${this}> but not found in node <${n}>.`);
        }
        n._es.splice(i, 1);
    }

    /**
     * Changes one of the nodes that the edge is connected between.
     * @param {!Node} oldNode
     * @param {!Node} newNode
     */
    _switchNode(oldNode, newNode) {
        if (oldNode === this._n1) {
            this._n1 = newNode;
        } else if (oldNode === this._n2) {
            this._n2 = newNode;
        } else {
            throw new Error(`Not an endpoint: ${oldNode}`);
        }
        this._removeFromNode(oldNode);
        newNode._es.push(this);
    }

    /**
     * Contracts this edge, merging its two nodes into one.
     *
     * All edges adjacent to either node will be adjacent to the new node.
     * The 'new' node is an overwritten version of this edge's first node.
     * The other node is deleted from the graph after transferring its edges.
     *
     * @param {*} newNodeData
     * @returns {!Node} The merged node.
     */
    contract(newNodeData) {
        this.del();
        if (this._n1 !== this._n2) {
            for (let e of this._n2._es) {
                e._switchNode(this._n2, this._n1);
            }
            this._n2.del();
        }
        this._n1.data = newNodeData;
        return this._n1;
    }

    /**
     * @param {!Node} node
     */
    endsOn(node) {
        return node === this._n1 || node === this._n2;
    }

    /**
     * @returns {!Array.<!Node>}
     */
    adjacentNodes() {
        return this.nodes;
    }

    /**
     * @returns {!Array.<!Edge>}
     */
    adjacentEdges() {
        let seen = new Set();
        let result = [];
        for (let e of [...this._n1._es, ...this._n2._es]) {
            if (!seen.has(e) && e !== this) {
                seen.add(e);
                result.push(e);
            }
        }
        return result;
    }

    /**
     * @param {T} endpoint
     * @returns {T}
     * @template T {!GraphNode|!GraphPort}
     */
    opposite(endpoint) {
        if (endpoint instanceof Port) {
            return new Port(this.opposite(endpoint._n), this);
        }
        if (endpoint === this._n1) {
            return this._n2;
        }
        if (endpoint === this._n2) {
            return this._n1;
        }
        throw new Error(`Not an endpoint: ${endpoint}`);
    }

    /**
     * @param {!Edge|!Node|!Port} element
     * @returns {undefined|!Node|!Edge|![!Node, !Node]}
     */
    intersection(element) {
        if (element instanceof Node) {
            return this.endsOn(element) ? element : undefined;
        }

        if (element instanceof Edge) {
            if (this === element) {
                return element;
            }
            let c1 = this.intersection(element._n1);
            let c2 = this.intersection(element._n2);
            if (c1 !== undefined && c2 !== undefined) {
                return [c1, c2];
            }
            return c1 || c2;
        }

        if (element instanceof Port) {
            return element.intersection(this);
        }

        throw new Error(`Unrecognized graph element: ${element}`);
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `Edge(id=${this._id}, nodes=${this._n1.data}:${this._n2.data}, data=${this.data})`;
    }
}

class Port {
    /**
     * @param {!Node} node
     * @param {!Edge} edge
     */
    constructor(node, edge) {
        this._n = node;
        this._e = edge;
    }

    /**
     * @returns {!string}
     */
    get id() {
        return `${this.node._id}:${this.edge._id}`;
    }

    /**
     * @returns {!Node}
     */
    get node() {
        return this._n;
    }

    /**
     * @returns {!Edge}
     */
    get edge() {
        return this._e;
    }

    /**
     * @param {!Edge|!Node|!Port} element
     * @returns {undefined|!Node|!Edge|!Port}
     */
    intersection(element) {
        if (element instanceof Node) {
            return this._n === element ? element : undefined;
        }

        if (element instanceof Edge) {
            if (this._e === element) {
                return this._e;
            }
            if (element.endsOn(this._n)) {
                return this._n;
            }
            return undefined;
        }

        if (element instanceof Port) {
            if (this._e === element._e && this._n === element._n) {
                return this;
            }
            if (this._e === element._e) {
                return this._e;
            }
            if (this._n === element._n) {
                return this._n;
            }
            return undefined;
        }

        throw new Error(`Unrecognized graph element: ${element}`);
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof Port && this._n === other._n && this._e === other._e;
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `GraphPort(${this._n} towards ${this._e.opposite(this._n)})`;
    }
}

/**
 * Graph with adjacency edge list representation.
 */
class Graph {
    /**
     * Creates a new empty graph.
     */
    constructor() {
        this._ns = [];
        this._nextId = 0;
    }

    /**
     * @returns {!Array.<Node>}
     */
    get nodes() {
        return [...this._ns];
    }

    /**
     * @returns {!Array.<Edge>}
     */
    get edges() {
        let result = [];
        let seen = new Set();
        for (let n of this._ns) {
            for (let e of n._es) {
                if (!seen.has(e)) {
                    seen.add(e);
                    result.push(e);
                }
            }
        }
        return result;
    }

    /**
     * @returns {!Map.<Node, int>}
     * @private
     */
    _currentNodeIndexMap() {
        let nodeIds = new Map();
        for (let i = 0; i < this._ns.length; i++) {
            nodeIds.set(this._ns[i], i);
        }
        return nodeIds;
    }

    /**
     * @param nodeDataToJson Function to serialize node data.
     * @param edgeDataToJson Function to serialize edge data.
     * @returns {!{nodes: !Array, edges: !Array}}
     */
    toJson(nodeDataToJson = e => e, edgeDataToJson = e => e) {
        let nodeIndices = this._currentNodeIndexMap();
        return {
            nodes: this._ns.map(e => nodeDataToJson(e.data)),
            edges: this.edges.map(e => ({
                n1: nodeIndices.get(e._n1),
                n2: nodeIndices.get(e._n2),
                data: edgeDataToJson(e.data),
            }))
        };
    }

    /**
     * @param {*} nodeData
     * @returns {!Node}
     */
    addNode(nodeData=undefined) {
        let node = new Node(this, this._nextId++, nodeData);
        this._ns.push(node);
        return node;
    }

    /**
     * @param {!{nodes: !Array, edges: !Array}} json
     * @param nodeJsonToData Function to deserialize serialized node data.
     * @param edgeJsonToData Function to deserialize serialized edge data.
     * @returns {!Graph}
     */
    static fromJson(json, nodeJsonToData = e => e, edgeJsonToData = e => e) {
        let graph = new Graph();
        graph._ns = json.nodes.map(e => graph.addNode(nodeJsonToData(e)));
        for (let {n1, n2, data} of json.edges) {
            graph._ns[n1].addEdgeTo(graph._ns[n2], edgeJsonToData(data));
        }
        return graph;
    }

    /**
     * @param {!function(*): *} nodeDataCopy Function to produce copies of node data.
     * @param {!function(*): *} edgeDataCopy Function to produce copies of edge data.
     * @returns {!Graph}
     */
    copy(nodeDataCopy = e => e, edgeDataCopy = e => e) {
        return Graph.fromJson(this.toJson(nodeDataCopy, edgeDataCopy));
    }

    /**
     * Contracts edges (and optionally degree two nodes that are not self-loops).
     *
     * @param {!function(!Edge) : !boolean} edgeCondition
     * @param {!function(!Edge) : *} edgeDataReplacer
     * @param {!function(!Node) : !boolean=undefined} binaryNodeCondition
     * @param {!function(!Node) : *=} binaryNodeDataReplacer
     */
    contract(edgeCondition, edgeDataReplacer, binaryNodeCondition=undefined, binaryNodeDataReplacer= e => e) {
        let moreWork = true;
        while (moreWork) {
            moreWork = false;

            for (let edge of this.edges) {
                if (edgeCondition(edge)) {
                    edge.contract(edgeDataReplacer(edge));
                    moreWork = true;
                }
            }

            if (binaryNodeCondition !== undefined) {
                for (let node of this._ns) {
                    if (node.degree === 2 && node._es[0] !== node._es[1] && binaryNodeCondition(node)) {
                        node.contract(binaryNodeDataReplacer(node));
                        moreWork = true;
                    }
                }
            }
        }
    }

    /**
     * Determines if two graphs have the same serialized representation.
     *
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof Graph && equate(this.toJson(), other.toJson());
    }

    /**
     * @returns {!string}
     */
    toString() {
        return describe(this.toJson());
    }
}

export {Node, Edge, Port, Graph}
