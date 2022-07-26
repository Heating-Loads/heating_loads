import ee 
from ee_plugin import Map

#load data

glo30 = ee.ImageCollection("projects/sat-io/open-datasets/GLO-30")
glo_elev = glo30.mosaic().setDefaultProjection('EPSG:3857',None,30)

#proposal
#take min elevation in bldg footprint-- FABDEM

#AK buildings (Erin's OSM table)
bldgs = ee.FeatureCollection('users/edtrochim/OSM_building_AK').filter(ee.Filter.bounds(geometry))
Map.addLayer(bldgs, {'color': 'black'}, 'Alaskan building footprints')

#FABDEM (Forest And Buildings removed Copernicus 30m DEM)
fabdem = ee.ImageCollection("projects/sat-io/open-datasets/FABDEM")
fabdem_elev = fabdem.mosaic().setDefaultProjection('EPSG:3857',None,30)
#elev = fabdem.mosaic().setDefaultProjection(glo30.first().projection())

min_elev = fabdem_elev.reduceRegions({'collection': bldgs,
                  'reducer': ee.Reducer.min(),
                  'scale':10
})

min_elev_glo = glo_elev.reduceRegions({'collection': bldgs,
                  'reducer': ee.Reducer.min(),
                  'scale':10
})

max_elev = fabdem_elev.reduceRegions({'collection': bldgs,
                  'reducer': ee.Reducer.max(),
                  'scale':10
})
max_elev_glo = glo_elev.reduceRegions({'collection': bldgs,
                  'reducer': ee.Reducer.max(),
                  'scale':10
})

print(min_elev.first(), min_elev_glo.first())

print(max_elev.first(), max_elev_glo.first())

elevationVis = {
  'min': -50.0,
  'max': 1000.0,
  'palette': ['#ffffcc','#a1dab4','#41b6c4','#2c7fb8','#253494'], #thx, colorbrewer
}

Map.addLayer(fabdem_elev, elevationVis, 'FABDEM Elevation')


#compare to max elevation in bldg height -- Copernicus Digital Elevation Model (GLO-30 DEM)¶

