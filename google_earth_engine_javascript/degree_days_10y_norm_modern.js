// Anchorage Bounds
var geometry_bounds = ee.FeatureCollection(
    'projects/earthengine-legacy/assets/projects/sat-io/open-datasets/geoboundaries/HPSCGS-ADM2'
).filter(
    ee.Filter.eq('shapeName', 'Anchorage Municipality' )
    //'Fairbanks North Star Borough'
);

/////////// Calculate Annual Degree Days///////////////

// Import daily temperature dataset
var era5 = ee.ImageCollection('ECMWF/ERA5/DAILY');

// Add inital and end dates for the required period
var iniDate = ee.Date('1981-01-01');
var endDate = ee.Date('2020-12-31');

// Select the temperature of air at 2m (temperature_2m) and restrict data to Alaska
var land_surface_temperature = era5.filterDate(iniDate, endDate).select('mean_2m_air_temperature').filter(
     ee.Filter.bounds(geometry_bounds.geometry())
 );
 
// Convert from K to C and add Freezing Days (FD) and Thawing Days (TD)                                 
var convert_replace = function(image){
    var props = image.toDictionary(image.propertyNames());
    var image_C = image.subtract(273.15);
    var FD = image_C.where(image_C.gt(0), 0).rename('FD');
    var TD = image_C.where(image_C.lt(0), 0).rename('TD');
    
    return ee.Image(image_C.addBands([FD, TD]).rename('temperature_2m', 'FD', 'TD').setMulti(props));
}

var daily_temp_celsius = land_surface_temperature.map(convert_replace);


// Create list of years
var years = daily_temp_celsius.aggregate_array('year').distinct();

var map_to_sequence_years = function(year){
  return daily_temp_celsius.filter(ee.Filter.eq('year', year)).reduce(ee.Reducer.sum()).set('year', year);
}
    
// Sum annual degree days
var degree_days_annual =  ee.ImageCollection.fromImages(
    years.map(map_to_sequence_years)
);

// Create 30 year norm of temperature, freezing and thawing days
var degree_days_30y_norm_regression = degree_days_annual
.filter(ee.Filter.and(ee.Filter.gte('year',1981),ee.Filter.lte('year',1981+29)))
    .select(['FD_sum','TD_sum'])
    .reduce(ee.Reducer.mean());

Export.image.toAsset({
  image: degree_days_30y_norm_regression.select('FD_sum_mean'),
  description: 'degree_days_30y_norm_regression_FD_sum_mean',
  assetId: 'projects/msftbuildingdata/assets/degree_days_30y_norm_regression_FD_sum_mean',  // <> modify these
  region: geometry_bounds,
  scale: 30,
  crs: 'EPSG:3338',
  // pyramidingPolicy: {SR_B5: 'mode'}
});
