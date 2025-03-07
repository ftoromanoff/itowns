import assert from 'assert';
import { Box3, Vector3, Vector2, Matrix4, Quaternion } from 'three';
import Coordinates from 'Coordinates';
import Extent from 'Extent';
import proj4 from 'proj4';

proj4.defs('EPSG:2154', '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

describe('Extent', function () {
    const minX = 0;
    const maxX = 10;
    const minY = -1;
    const maxY = 3;
    const minZ = -50;
    const maxZ = 42;

    it('should build the expected extent using values', function () {
        const withValues = new Extent('EPSG:4326',
            minX,
            maxX,
            minY,
            maxY);
        assert.equal(minX, withValues.west);
        assert.equal(maxX, withValues.east);
        assert.equal(minY, withValues.south);
        assert.equal(maxY, withValues.north);
    });

    it('should build the expected extent from box3', function () {
        const box = new Box3(
            new Vector3(Math.random(), Math.random()),
            new Vector3(Math.random(), Math.random()));
        const fromBox = Extent.fromBox3('EPSG:4326', box);

        assert.equal(fromBox.west, box.min.x);
        assert.equal(fromBox.east, box.max.x);
        assert.equal(fromBox.north, box.max.y);
        assert.equal(fromBox.south, box.min.y);
    });

    it('should subdivide the extent in four piece', function () {
        const toSubdivide = new Extent('EPSG:4326', -10, 10, -10, 10);
        const subdivided = toSubdivide.subdivision();

        assert.equal(subdivided.length, 4);
        // NE
        assert.strictEqual(subdivided[0].west, 0);
        assert.strictEqual(subdivided[0].east, 10);
        assert.strictEqual(subdivided[0].south, 0);
        assert.strictEqual(subdivided[0].north, 10);
        // SE
        assert.strictEqual(subdivided[1].west, 0);
        assert.strictEqual(subdivided[1].east, 10);
        assert.strictEqual(subdivided[1].south, -10);
        assert.strictEqual(subdivided[1].north, 0);
        // NW
        assert.strictEqual(subdivided[2].west, -10);
        assert.strictEqual(subdivided[2].east, 0);
        assert.strictEqual(subdivided[2].south, 0);
        assert.strictEqual(subdivided[2].north, 10);
        // SW
        assert.strictEqual(subdivided[3].west, -10);
        assert.strictEqual(subdivided[3].east, 0);
        assert.strictEqual(subdivided[3].south, -10);
        assert.strictEqual(subdivided[3].north, 0);
    });

    it('should return the correct planar dimensions', function () {
        const extent = new Extent('EPSG:4326', -15, 10, -10, 10);
        const dimensions = extent.planarDimensions();

        // Width
        assert.equal(dimensions.x, 25);
        // Height
        assert.equal(dimensions.y, 20);
    });

    it('should return the correct earth euclidean dimensions', function () {
        const extent = new Extent('EPSG:4326', 3, 3.01, 46, 46.01);
        const dimensions = new Vector2();

        extent.spatialEuclideanDimensions(dimensions);
        assert.equal(dimensions.x, 774.4934293643765);
        assert.equal(dimensions.y, 1111.5141604285038);
    });

    it('should return the correct geodesic dimensions', function () {
        const extent = new Extent('EPSG:4326', 3, 3.01, 46, 46.01);
        const dimensions = new Vector2();

        extent.geodeticDimensions(dimensions);
        assert.equal(dimensions.x, 773.2375602074535);
        assert.equal(dimensions.y, 1113.3197697640906);
    });

    it('should clone extent like expected', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY);
        const clonedExtent = withValues.clone();
        assert.equal(clonedExtent.west, withValues.west);
        assert.equal(clonedExtent.east, withValues.east);
        assert.equal(clonedExtent.south, withValues.south);
        assert.equal(clonedExtent.north, withValues.north);
    });

    it('should convert extent EPSG:4326 like expected', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY).as('EPSG:3857');
        assert.equal(0, withValues.west);
        assert.equal(1113194.9079327357, withValues.east);
        assert.equal(-111325.14286638597, withValues.south);
        assert.equal(334111.1714019597, withValues.north);
    });

    it('should return center of extent expected', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY);
        const center = withValues.center();
        assert.equal(5, center.longitude);
        assert.equal(1, center.latitude);
    });
    it('should return dimensions of extent expected', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY);
        const dimensions = withValues.planarDimensions();
        assert.equal(10, dimensions.x);
        assert.equal(4, dimensions.y);
    });

    it('should return true is point is inside extent expected', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY);
        const coord = new Coordinates('EPSG:4326', minX + 1, minY + 2);
        assert.ok(withValues.isPointInside(coord));
    });

    it('should return true is extent is inside extent expected', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY);
        const inside = new Extent('EPSG:4326', minX + 1, maxX - 1, minY + 1, maxY - 1);
        assert.ok(withValues.isInside(inside, 1));
    });

    it('should return expected offset', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY);
        const inside = new Extent('EPSG:4326', minX + 1, maxX - 1, minY + 1, maxY - 1);
        const offset = withValues.offsetToParent(inside);
        assert.equal(offset.x, -0.125);
        assert.equal(offset.y, -0.5);
        assert.equal(offset.z, 1.25);
        assert.equal(offset.w, 2);
    });

    it('should return true if intersect other extent', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY);
        const inter = new Extent('EPSG:4326', minX + 1, maxX - 1, maxY - 1, maxY + 2);
        assert.ok(withValues.intersectsExtent(inter));
    });

    it('should intersect like expected', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY);
        const extent = new Extent('EPSG:4326', minX + 1, maxX - 1, maxY - 1, maxY + 2);
        const inter = withValues.intersect(extent);
        assert.equal(1, inter.west);
        assert.equal(9, inter.east);
        assert.equal(2, inter.south);
        assert.equal(3, inter.north);
    });

    it('should set values', function () {
        const withValues = new Extent('EPSG:4326');
        withValues.set(minX, maxX, minY, maxY);
        assert.equal(minX, withValues.west);
        assert.equal(maxX, withValues.east);
        assert.equal(minY, withValues.south);
        assert.equal(maxY, withValues.north);
    });

    it('should set values from array', function () {
        const extent = new Extent('EPSG:4326');
        const array = [minX, maxX, minY, maxY, minZ, maxZ];

        extent.setFromArray(array);
        assert.deepEqual(
            [minX, maxX, minY, maxY],
            [extent.west, extent.east, extent.south, extent.north],
        );

        extent.setFromArray(array, 2);
        assert.deepEqual(
            [minY, maxY, minZ, maxZ],
            [extent.west, extent.east, extent.south, extent.north],
        );
    });

    it('sould set values from an extent-like object', function () {
        const extent = new Extent('EPSG:4326');
        extent.setFromExtent({
            west: minX,
            east: maxX,
            south: minY,
            north: maxY,
        });
        assert.equal(minX, extent.west);
        assert.equal(maxX, extent.east);
        assert.equal(minY, extent.south);
        assert.equal(maxY, extent.north);
    });

    it('should copy extent', function () {
        const toCopy = new Extent('EPSG:2154', minX, maxX, minY, maxY);
        const withValues = new Extent('EPSG:4326');
        withValues.copy(toCopy);
        assert.equal('EPSG:2154', withValues.crs);
        assert.equal(minX, withValues.west);
        assert.equal(maxX, withValues.east);
        assert.equal(minY, withValues.south);
        assert.equal(maxY, withValues.north);
    });

    it('should union like expected', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY);
        const extent = new Extent('EPSG:4326', minX + 1, maxX - 1, maxY - 1, maxY + 2);
        withValues.union(extent);
        assert.equal(0, withValues.west);
        assert.equal(10, withValues.east);
        assert.equal(-1, withValues.south);
        assert.equal(5, withValues.north);
    });

    it('should expand by point', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY);
        const coord = new Coordinates('EPSG:4326', maxX + 1, maxY + 2);
        withValues.expandByCoordinates(coord);
        assert.equal(0, withValues.west);
        assert.equal(11, withValues.east);
        assert.equal(-1, withValues.south);
        assert.equal(5, withValues.north);
    });

    it('should convert EPSG extent values to string', function () {
        const withValues = new Extent('EPSG:4326', minX, maxX, minY, maxY);
        const tostring = withValues.toString(',');
        const toValues = tostring.split(',').map(s => Number(s));
        assert.equal(toValues[0], withValues.east);
        assert.equal(toValues[1], withValues.north);
        assert.equal(toValues[2], withValues.west);
        assert.equal(toValues[3], withValues.south);
    });

    it('should copy and transform extent', function () {
        const withValues = new Extent('EPSG:4326', 0, 0, 0, 0);
        const extent = new Extent('EPSG:4326', minX + 1, maxX - 1, maxY - 1, maxY + 2);
        const position = new Vector3(1, 2, 0);
        const scale = new Vector3(2, -2, 1);
        const quaternion = new Quaternion();
        const matrix = new Matrix4().compose(position, quaternion, scale);

        withValues.copy(extent).applyMatrix4(matrix);
        assert.equal(3, withValues.west);
        assert.equal(19, withValues.east);
        assert.equal(-8, withValues.south);
        assert.equal(-2, withValues.north);
    });

    it('should get the right center for extrem cases', function () {
        const extent = new Extent('EPSG:4326', 160, 200, -10, 10);
        let center = extent.center();
        assert.equal(180, center.x);
        assert.equal(0, center.y);
        assert.equal(0, center.z);

        extent.set(-10, 10, 80, 100);
        center = extent.center();
        assert.equal(0, center.x);
        assert.equal(90, center.y);
        assert.equal(0, center.z);
    });

    it('should throw error when instance with geocentric projection', () => {
        assert.throws(() => new Extent('EPSG:4978'));
    });
});
