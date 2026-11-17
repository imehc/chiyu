export const airportParse = (row: string[]) => {
	if (row.length < 14) return null;
	const [
		airportId,
		name,
		city,
		country,
		iata,
		icao,
		lat,
		lng,
		alt,
		timezone,
		dst,
		tz,
		type,
		source,
	] = row;
	return {
		airportId,
		name,
		city,
		country,
		iata,
		icao,
		lat,
		lng,
		alt,
		timezone,
		dst,
		tz,
		type,
		source,
	};
};
export const routeParse = (row: string[]) => {
	if (row.length < 9) return null;
	const [
		airline,
		airlineId,
		srcIata,
		srcAirportId,
		dstIata,
		dstAirportId,
		codeshare,
		stops,
		equipment,
	] = row;
	return {
		airline,
		airlineId,
		srcIata,
		srcAirportId,
		dstIata,
		dstAirportId,
		codeshare,
		stops,
		equipment,
	};
};

type AirPortPoint = {
	lat: string;
	lng: string;
	country: string;
};

export type Plane = {
	airline: string;
	srcIata: string;
	dstIata: string;
	srcAirport: AirPortPoint;
	dstAirport: AirPortPoint;
};
