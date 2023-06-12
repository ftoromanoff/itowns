const assert = require('assert');

describe('source_stream_wfs_3d', function _() {
    let pageLoaded;
    const title = this.fullTitle();

    it("should load 'source_stream_wfs_3d' page", async function _it() {
        pageLoaded = await loadExample('examples/source_stream_wfs_3d.html', title);
        assert.ok(pageLoaded);
    });

    it('should remove GeometryLayer', async function _it() {
        if (pageLoaded) {
            const countGeometryLayerStart = await page.evaluate(() => view.getLayers(l => l.isGeometryLayer).length);
            await page.evaluate(() => view.removeLayer('WFS Bus lines'));
            const countGeometryLayerEnd = await page.evaluate(() => view.getLayers(l => l.isGeometryLayer).length);
            assert.ok(countGeometryLayerStart - countGeometryLayerEnd === 1);
        } else {
            this.skip();
        }
    });
});
