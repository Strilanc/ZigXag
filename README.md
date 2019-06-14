*WORK IN PROGRESS*

Surface sketch is intended to be like [Quirk](https://github.com/Strilanc/Quirk), but for the surface code.
A tool that combines the ability to edit and simulate braiding-based computations.
It is a rethinking of [Snitch](https://github.com/Strilanc/Snitch), which is a far more hands-on surface code simulation that I ultimately decided was going in the wrong direction.

The main design goal of surface sketch is to be able to validate T factory constructions such as this one modelled in sketchup:

![concept](/doc/t-factory.jpg)

This is challenging for several reasons:

1. A full scale simulation involves tens of thousands of physical qubits. Stabilizer circut simulators can handle this, but then the T state injections create a 2^15 overhead factor. It is not clear how to achieve the required performance.

2. There is a large amount of unstated classical feedforward operations in the above diagram. There needs to be some way of specifying this, ideally within the existing diagrammatic language. It is not clear how best to do this. To make matters worse, the feedforward is often ordered topologically instead of chronologically.

3. There are simply a large number of small details that need to be hammered out. Is it tractable to edit diagrams by "dragging" the braids? How are specific elements added and removed from the diagram? How do state displays fit into the diagram? What are the exact physical operations implied by the diagram? What kind of error tolerance information is feasible to compute and desirable to see?

Here is a sort of concept drawing, which was actually produced using the tool, but the state displays are actually incorrect:

![concept](/doc/concept.jpg)
