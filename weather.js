var request = require('request-promise')
var cron = require('cron').CronJob

var cityesCache = {};
var weatherCache = {};

var getCoordinates = async function(city, callback) {
    city = city.toLowerCase()
    
    if (typeof cityesCache[city] !== 'undefined') {
        if (cityesCache[city] != 0) {
            callback(null, cityesCache[city].lat, cityesCache[city].lon)
        } else {
            callback("Город не найден!", -1, -1)
        }
    } else {
        request.get({
            url: `https://nominatim.openstreetmap.org/search?q=${encodeURI(city)}&format=json&email=qwartz@node.psq`,
            json: true
        }, (err, res, data) => {
            if (err || res.statusCode !== 200) {
                callback(err, -1, -1)
            } else {
                if (data.length > 0) {
                    var lat = data[0].lat,
                        lon = data[0].lon;

                        cityesCache[city] = {
                            lat: lat,
                            lon: lon
                        }
                    callback(null, lat, lon)
                } else {
                    cityesCache[city] = 0
                    
                    callback("Город не найден!", -1, -1)
                }
            }
        })
    }
}

var getWeather = async function(city, callback) {
    city = city.toLowerCase()
    
    if (typeof weatherCache[city] !== 'undefined') {
        callback(null, weatherCache[city]);
    } else {
        console.log("Getting coordinates of " + city)
        getCoordinates(city, (err, lat, lon) => {
            if (err) {
                callback(err, null)
            } else {
                console.log("Getting weather of " + city)
                request.get({
                    url: `https://api.darksky.net/forecast/b05e750a29582ec95d626292f83991b3/${lat},${lon}?lang=ru&units=si&exclude=daily,flags`,
                    json: true
                }, (err, res, data) => {
                    if (err || res.statusCode !== 200) {
                        console.log(err)
                        callback("Погода временно недоступна, попробуйте позже!", null)
                    } else {
                        weatherCache[city] = data;
                        callback(null, data)
                    }
                })
            }
        })
    }
}

module.exports = {getCoordinates, getWeather}

const job = new cron('0 */30 * * * *', () => {
    console.log('Clearing weather cache...')
    weatherCache = {};
})

job.start();