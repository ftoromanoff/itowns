const assert = require('assert');

describe('source_file_kml_raster', function _() {
    let result;
    before(async () => {
        result = await loadExample('examples/source_file_kml_raster.html', this.fullTitle());
    });

    it('should run', async () => {
        assert.ok(result);
    });

    it('load features data', async () => {
        const features = await page.evaluate(() => {
            const promises = [];
            const layers = view.getLayers(l => l.source && l.source.isFileSource);
            for (let i = 0; i < layers.length; i++) {
                promises.push(layers[i].source.loadData({}, { crs: 'EPSG:4326' }));
            }

            return Promise.all(promises);
        });
        assert.equal(features.length, 2); // the layer and the LabelLayer
        assert.equal(features[0].uuid, features[1].uuid);
    });

    it('should pick feature from Layer with SourceFile', async () => {
        const pickedFeatures = await page.evaluate(() => {
            const precision = view.getPixelsToDegrees(5);
            const geoCoord = new itowns.Coordinates('EPSG:4326', 6.80665, 45.91308, 0);
            const promises = [];
            const layers = view.getLayers(l => l.source && l.source.isFileSource);
            for (let i = 0; i < layers.length; i++) {
                promises.push(layers[i].source.loadData({}, { crs: 'EPSG:4326', buildExtent: false }));
            }

            return Promise.all(promises).then(fa => fa.filter(f => itowns
                .FeaturesUtils.filterFeaturesUnderCoordinate(geoCoord, f, precision).length));
        });

        assert.equal(2, pickedFeatures.length);
        assert.equal(pickedFeatures[0].uuid, pickedFeatures[1].uuid);

        assert.equal(pickedFeatures[0].features.length, 3, 'should have 3 features');
        assert.equal(pickedFeatures[0].features[0].type, 1);
        assert.equal(pickedFeatures[0].features[1].type, 2);
        assert.equal(pickedFeatures[0].features[2].type, 0);
    });
});
