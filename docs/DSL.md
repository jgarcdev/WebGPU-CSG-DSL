# CSG DSL

To render an object:
```
let object = ...;

Render(object);
```

Comments:
```
// This is a comment
/*
	This is a multi-line comment
*/
```

## Data Types

Float
- `2.0`, `-2.0`
- `0.2`, `-0.2`
- `.5`, `-.5`

Object
- `SphereObject`, `CubeObject`, `CylinderObject`
- `TranslatedObject`, `RotatedObject`, `ScaledObject`
- `UnionObject`, `DifferenceObject`, `IntersectionObject`
- `ColoredObject`
- `object` (generic type for any object)

## Primitives

- `Sphere(radius) -> SphereObject`
- `Cube(size) -> CubeObject`
- `Cylinder(radius, height) -> CylinderObject`
- `Pyramid(baseSize, height) -> PyramidObject`
- `Cone(radius, height) -> ConeObject`
- `Torus(majorRadius, minorRadius) -> TorusObject`
- `Octahedron(size) -> OctahedronObject`

```
let sphere = Sphere(1.2);
let cube = Cube(2.0);
let cylinder = Cylinder(0.5, 3.0);
let pyramid = Pyramid(1.0, 2.0);
let cone = Cone(0.5, 2.0);
let torus = Torus(1.0, 0.3);
let octahedron = Octahedron(1.5);
```

## Transformations

- `translate(obj, offX, offY, offZ) -> TranslatedObject`
- `rotate(obj, angleX, angleY, angleZ) -> RotatedObject`
- `scale(obj, scaleX, scaleY, scaleZ) -> ScaledObject`

```
let translatedSphere = translate(sphere, 1.0, 0.0, 0.0)
let rotatedCube = rotate(cube, 0.0, 45.0, 0.0)
let scaledCylinder = scale(cylinder, 1.0, 2.0, 1.0)
```

## Operations

- `union(obj1, obj2) -> UnionObject`
	- $obj1 \cup obj2$
- `difference(obj1, obj2) -> DifferenceObject`
	- $obj1 \setminus obj2$
- `intersection(obj1, obj2) -> IntersectionObject`
	- $obj1 \cap obj2$

```
let unionObject = union(sphere, cube)
let differenceObject = difference(sphere, cylinder)
let intersectionObject = intersection(cube, cylinder)

let complexObject = union(
	difference(sphere, cylinder),
	intersection(cube, cylinder)
)
```

## Effects

- `color(obj, r, g, b) -> ColoredObject`
	- RGB between 0 and 255


## CSG-IR

The top-level of an IR contains an optional `[version]`.
It then must include the "program" itself, enclosed in `[]`.

There are four types of statements/entries:
- `Renders[]`
- `Primitives[]`
- `Transformations[]`
- `CSG[]`

Each of these sections contain a list of objects, referred as 
- `p.x` for the `x`-th entry in `Primitives`
- `t.x` for the `x`-th entry in `Transformations`
- `c.x` for the `x`-th entry in `CSG`

Each entry in `Renders` is an index to an object defined in `Primitives`, `Transformations`, or `CSG`. These objects are the ones to be rendered in the final output.

Each entry in `Primitives` represents a created primitive object.
The entry includes the type of primitive (sphere, cube, cylinder) and its parameters in the form of `Type[...params]`. For example, `Sphere[1.2]` represents a sphere with radius 1.2. There can be multiple entries of the same type and 
multiple entries of the same type and parameters. In other words, 
each entry is unique.

Each entry in `Transformations` represents a transformation applied to an object.
The entry includes a reference to the parent object (via the aforementioned references) and its corresponding matrix. For example, `p.0[...]` may represent
some transformation (say a translation of (1, 0, 0)) applied to the primitive object `p.0` (the 0th entry in `Primitives`). Similar to `Primitives`, there can be multiple entries that refer to the same parent object and have the same transformation. Each entry is unique and creates a new object.

Each entry in `CSG` represents a CSG operation applied to objects.
The entry includes the type of operation (union, difference, intersection) and references to the operand objects (via the aforementioned references).
For example, `Union[p.0, t.0]` represents a union operation between the primitive object `p.0` and the transformation object `t.0`. Similar to `Primitives` and `Transformations`, there can be multiple entries that refer to the same operand objects and have the same operation. Each entry is unique and creates a new object.


Given the following code:
```
let sphere = Sphere(1.2);
let cube = Cube(2.0);
let cylinder = Cylinder(0.5, 3.0);

let movedSphere = translate(sphere, 1.0, 0.0, 0.0);
let rotatedCube = rotate(cube, 0.0, 45.0, 0.0);
let stretchedCylinder = scale(cylinder, 1.0, 2.0, 1.0);

let hole = difference(movedSphere, stretchedCylinder);
let body = union(hole, rotatedCube);

let finalObject = scale(body, 1, 1, 1);

Render(finalObject);
```
The corresponding CSG-IR may look like:
```
[
	Renders[c.0]
	Primitives[
		Sphere[1.2]
		Cube[2.0]
		Cylinder[0.5, 3.0]
	]
	Transformations[
		p.0[1.0, 0.0, 0.0, 1.0,
				0.0, 1.0, 0.0, 0.0,
				0.0, 0.0, 1.0, 0.0,
				0.0, 0.0, 0.0, 1.0
		]
		p.1[0.707, 0.0, 0.707, 0.0,
				0.0, 1.0, 0.0, 0.0,
				-0.707, 0.0, 0.707, 0.0,
				0.0, 0.0, 0.0, 1.0
		]
		p.2[1.0, 0.0, 0.0, 0.0,
				0.0, 2.0, 0.0, 0.0,
				0.0, 0.0, 1.0, 0.0,
				0.0, 0.0, 0.0, 1.0
		]
		c.1[1.0, 0.0, 0.0, 0.0,
				0.0, 1.0, 0.0, 0.0,
				0.0, 0.0, 1.0, 0.0,
				0.0, 0.0, 0.0, 1.0
		]
	]
	CSG[
		Difference[t.0, t.2]
		Union[c.0, t.1]
	]
]
```

### Attributes

Primitives may contain certain attributes, such as `color` or `material`.
These attributes are defined as part of the primitive entry. The format is as follows:
```
Primitive[
	Type[...params]{
		Attribute1[...params]
		Attribute2[...params]
		...
	}
]
```
For example, a red sphere with radius 1.2 may be represented as:
```
Primitive[
	Sphere[1.2]{
		Color[255, 0, 0]
	}
]
```

## Self-Notes

Metaprogramming (future)

- Functions that applies a preset transformation/operation to objects
	- Only "return" type is an object
		- Only return statement is the last line of the function
Ie:
```
fxn H2O(oxy, hyd1, hyd2) {
	// Assume objects are at desired positions and scales
	let oxyHyd1 = union(oxy, hyd1)
	let molecule = union(oxyHyd1, hyd2)
	molecule
}

let ...;

let water = H2O(oxygen, hydrogen1, hydrogen2)
```

- Loops and if-statements that generate code at compile time