# CSG DSL

To render an object:
```
let object = ...

Render(object)
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

```
let sphere = Sphere(1.2)
let cube = Cube(2.0)
let cylinder = Cylinder(0.5, 3.0)
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

## Other

- `color(obj, r, g, b) -> ColoredObject`





## Self-Notes

Future if time allows:
- Function that applies a preset transformation/operation to objects
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

- Metaprogramming??
	- Allow functions and loops that generates code at compile time