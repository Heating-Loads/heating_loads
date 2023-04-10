//Define palette colors
var palettes = require('users/gena/packages:palettes');
var palette = palettes.matplotlib.magma[7];

//Anchorage Bounds
var anchorage_bounds = ee.FeatureCollection('projects/earthengine-legacy/assets/projects/sat-io/open-datasets/geoboundaries/HPSCGS-ADM2')
                  .filter(ee.Filter.eq('shapeName', 'Anchorage Municipality' ));

//Alaska Bounds
var alaska_bounds = ee.FeatureCollection('projects/earthengine-legacy/assets/projects/sat-io/open-datasets/geoboundaries/SSCGS-ADM1')
                .filter(ee.Filter.eq('shapeName', 'Alaska' ));
Map.addLayer(ee.Image().paint(anchorage_bounds,0,3), {"palette":["black"]}, 'anchorage_bounds');

//Import daily temperature dataset
var dataset = ee.ImageCollection('ECMWF/ERA5/DAILY');

//Add inital and end dates for the required period
var iniDate = ee.Date('1981-01-01')
var endDate = ee.Date('2020-12-31')


//Import building outlines
var buildings = ee.FeatureCollection("users/edtrochim/OSM_building_AK").filter(ee.Filter.bounds(railbelt));
print(buildings.first())
          
//Import zip codes data
var zipCodes= ee.FeatureCollection('TIGER/2010/ZCTA5').filter(ee.Filter.bounds(alaska_bounds.geometry()));
print(zipCodes.limit(1))


// Select the temperature of air at 2m (temperature_2m) and restrict data to Alaska
var landSurfaceTemperature = dataset.filterDate(iniDate, endDate).select('mean_2m_air_temperature')
                                    .filter(ee.Filter.bounds(alaska_bounds.geometry()))

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



//Create function to join buildings and zipcodes
var buildingsZip = zipCodes.map(function(feat){
  feat = ee.Feature(feat);
  var name = feat.get('ZCTA5CE10');
  var buildingsFilt = buildings.filterBounds(feat.geometry()).map(function(zone){
    return ee.Feature(zone).set('zip_code', name).set('zip_group',ee.String(name).slice(0,4));
  });
  return buildingsFilt;
}).flatten();

print(buildingsZip.limit(1))

//Create a list of distinct zip codes
var uniq_zip = buildingsZip.aggregate_array('zip_group').distinct()
print(uniq_zip.length())   


//Function to batch buildings

//A batch of buildings is identified by zip_group (first 3 or 4 digits of zip code)
// The following function is being applied over every zip_group
var batch_export = uniq_zip.map(function(zip){
  
  //Filter buildings by a zip_group
  var batch = buildingsZip.filter(ee.Filter.eq('zip_group', zip));
  
  //Apply reduce region over climate data using the filtered building collection
   var climate_reduced = climate.reduceRegions({collection: batch,  // (if some other image needs to be reduced, replace climate with that image name)
                                           reducer: ee.Reducer.mean(),
                                           scale: 10
                                           });
  //Return the filtered feature collection with mean                                        
  return climate_reduced

    });


//We get one feature collection per zip_group and iterating the above function for every zip_group gives a list of feature collections

//Combine list of feature collections into one large collection
var exp = ee.FeatureCollection(batch_export).flatten()




// Create 30 year norm of temperature, freezing and thawing days
var degreeDays30yNorm = degreeDaysAnnual.filter(ee.Filter.and(ee.Filter.gte('year',1981), ee.Filter.lte('year',1981+29)))
                                        .select(['FD_sum','TD_sum'])
                                        .reduce(ee.Reducer.mean())

// Create 30 year norm of temperature, freezing and thawing days
var degreeDays30yNorm_rec = degreeDaysAnnual.filter(ee.Filter.and(ee.Filter.gte('year',1991), ee.Filter.lte('year',1991+29)))
                                            .select(['FD_sum','TD_sum'])
                                            .reduce(ee.Reducer.mean())

// Create 10 year norm of temperature, freezing and thawing days
var degreeDays10yNorm_80s = degreeDaysAnnual.filter(ee.Filter.and(ee.Filter.gte('year',1981), ee.Filter.lte('year',1981+9)))
                                            .select(['FD_sum','TD_sum'])
                                            .reduce(ee.Reducer.mean())

// Create 10 year norm of temperature, freezing and thawing days
var degreeDays10yNorm_90s = degreeDaysAnnual.filter(ee.Filter.and(ee.Filter.gte('year',1991), ee.Filter.lte('year',1991+9)))
                                            .select(['FD_sum','TD_sum'])
                                            .reduce(ee.Reducer.mean())

// Create 10 year norm of temperature, freezing and thawing days
var degreeDays10yNorm_2000s = degreeDaysAnnual.filter(ee.Filter.and(ee.Filter.gte('year',2001), ee.Filter.lte('year',2001+9)))
                                              .select(['FD_sum','TD_sum'])
                                              .reduce(ee.Reducer.mean())

// Create 10 year norm of temperature, freezing and thawing days
var degreeDays10yNorm_2010s = degreeDaysAnnual.filter(ee.Filter.and(ee.Filter.gte('year',2011), ee.Filter.lte('year',2011+9)))
                                              .select(['FD_sum','TD_sum'])
                                              .reduce(ee.Reducer.mean())


// Exports 
Export.image.toAsset({
  image: degreeDays30yNorm,
  description: 'export_climate',
  assetId: 'climate_variables',
  scale: '11500',
  crs: 'EPSG:3338',
  maxPixels: 1e13
});


Export.image.toAsset({
  image: degreeDays30yNorm_rec,
  description: 'export_climate',
  assetId: 'climate_variables',
  scale: '11500',
  crs: 'EPSG:3338',
  maxPixels: 1e13
});


Export.image.toAsset({
  image: degreeDays10yNorm_80s,
  description: 'export_climate',
  assetId: 'climate_variables',
  scale: '11500',
  crs: 'EPSG:3338',
  maxPixels: 1e13
});


Export.image.toAsset({
  image: degreeDays10yNorm_90s,
  description: 'export_climate',
  assetId: 'climate_variables',
  scale: '11500',
  crs: 'EPSG:3338',
  maxPixels: 1e13
});


Export.image.toAsset({
  image: degreeDays10yNorm_2000s,
  description: 'export_climate',
  assetId: 'climate_variables',
  scale: '11500',
  crs: 'EPSG:3338',
  maxPixels: 1e13
});
 

Export.image.toAsset({
  image: degreeDays10yNorm_2010s,
  description: 'export_climate',
  assetId: 'climate_variables',
  scale: '11500',
  crs: 'EPSG:3338',
  maxPixels: 1e13
});