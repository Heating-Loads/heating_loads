//Define palette colors
var palettes = require('users/gena/packages:palettes');
var palette = palettes.matplotlib.magma[7];


//Anchorage Bounds
var anchorage_bounds = ee.FeatureCollection('projects/earthengine-legacy/assets/projects/sat-io/open-datasets/geoboundaries/HPSCGS-ADM2')
                  .filter(ee.Filter.eq('shapeName', 'Anchorage Municipality' ));


Map.addLayer(ee.Image().paint(anchorage_bounds,0,3), {"palette":["black"]}, 'anchorage_bounds');


//Import daily temperature dataset
var dataset = ee.ImageCollection('ECMWF/ERA5/DAILY');

//Add inital and end dates for the required period
var iniDate = ee.Date('1981-01-01')
var endDate = ee.Date('2020-12-31') 



// Select the temperature of air at 2m (temperature_2m) and restrict data to Alaska
var landSurfaceTemperature = dataset.filterDate(iniDate, endDate).select('mean_2m_air_temperature')
                                    .filter(ee.Filter.bounds(anchorage_bounds.geometry()))

//Convert from K to C and add Freezing Days (FD) and Thawing Days (TD)                                 
var convert_replace = function(image) {
  // Save image property names to retain day of year, system:index and year
  var props = image.toDictionary(image.propertyNames());
  // Conversion from K to C
  var image_C = image.subtract(273.15)
  // Replacing temperatures more than 0 Celsius with 0 (as they are not freezing days)
  var FD = image_C.where(image_C.gt(0), 0).rename('FD')
  // Replacing temperatures less than 0 Celsius with 0 (as they are not thawing days);
  var TD = image_C.where(image_C.lt(0), 0).rename('TD')
  
  return ee.Image(image_C.addBands([FD, TD]).rename('temperature_2m', 'FD', 'TD').setMulti(props));
};


var daily_temp_celsius = landSurfaceTemperature.map(convert_replace);


// Create list of years
var years = daily_temp_celsius.aggregate_array('year').distinct()


// Sum annual degree days
var degreeDaysAnnual =  ee.ImageCollection.fromImages(
  // Map function to sequence of years
  years.map(function (y) {
        // Filter for each year                          
        return daily_temp_celsius.filter(ee.Filter.eq('year', y))
                                // Sum
                                .reduce(ee.Reducer.sum())
                                // Set year
                                .set('year', y);
  })
);

// Create 30 year norm of temperature, freezing and thawing days
var degreeDays30yNorm = degreeDaysAnnual.filter(ee.Filter.and(ee.Filter.gte('year',1981), ee.Filter.lte('year',1981+29))).select(['FD_sum','TD_sum']).reduce(ee.Reducer.mean())

// This function computes a feature's geometry area and adds it as a property.
var addArea = function(feature) {
  return feature.set({areasq_ft: feature.geometry().area().multiply(10.7639)})
};

// Import building features from OSM data and map the area getting function over the FeatureCollection.
var AK_buildings_OSM = ee.FeatureCollection('users/edtrochim/OSM_building_AK')
                       .map(addArea)
                       .select(['areasq_ft'])
                       .filter(ee.Filter.bounds(anchorage_bounds.geometry()));


// Import world settlements footprints data - for year of built
var wsf_evo = ee.ImageCollection("projects/sat-io/open-datasets/WSF/WSF_EVO").select('b1').filter(ee.Filter.bounds(anchorage_bounds.geometry()))
var wsf_evo_min = wsf_evo.reduce(ee.Reducer.min());
var wfs_evo_palette = ['#1a9850', '#66bd63', '#a6d96a', '#d9ef8b', '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d73027']


//Import FABDEM (Forest And Buildings removed Copernicus 30m DEM) - for elevation
var fabdem = ee.ImageCollection("projects/sat-io/open-datasets/FABDEM").filter(ee.Filter.bounds(anchorage_bounds.geometry()));
var elevation = fabdem.mosaic()

var combined_data = degreeDays30yNorm.addBands([wsf_evo_min, elevation])


//Create combined reducer for mean, min and max

var reducers = ee.Reducer.mean().combine({
  reducer2: ee.Reducer.min(),
  sharedInputs: true
}).combine({
  reducer2: ee.Reducer.percentile([75]),
  sharedInputs: true
});


var building_mean = function(image){return image.reduceRegions({
  collection: AK_buildings_OSM,
  reducer: reducers,
  scale: 30
})}


Export.table.toDrive({
  collection: building_mean(combined_data),
  description: 'Anchorage_Building_DD',
  folder: 'Vidisha',
  fileFormat: 'CSV'
})



                                    
