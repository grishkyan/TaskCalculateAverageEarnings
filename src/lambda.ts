import 'dotenv/config';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';
import { parse } from 'papaparse';

const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
const alphaVantageUrl = process.env.ALPHA_VANTAGE_URL;

interface CompanyData {
    symbol: string;
    name: string;
    reportDate: string;
    fiscalDateEnding: string;
    estimate: string;
    currency: string;
}

interface CsvEarningsData {
    symbol: string;
    name: string;
    reportDate: string;
    fiscalDateEnding: string;
    estimate: string;
    currency: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const { cur: curParams, targetCur: targetCurrency } = event.queryStringParameters || {};

    if (curParams && !Array.isArray(curParams)) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'cur parameter must be an array' }),
        };
    }

    if (typeof targetCurrency !== 'string') {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'targetCur parameter must be a string' }),
        };
    }

    try {       
        const earningsData = await fetchEarningsData();

        const nearestMonthCompanies = findNearestMonthCompanies(earningsData);

        const filteredCompanies = filterCompaniesByCurrencies(nearestMonthCompanies, curParams);

        const averageEarnings = await calculateAverageEarnings(filteredCompanies, targetCurrency);

        return {
            statusCode: 200,
            body: JSON.stringify({ averageEarnings }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
};

async function fetchEarningsData(): Promise<CsvEarningsData[]> {
    const response = await axios.get(`${alphaVantageUrl}query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${apiKey}`);
    const csvData = response.data;
    const parsedData = parse(csvData, { header: true }).data as CsvEarningsData[];
    return parsedData;
}

async function fetchExchangeRate(fromCurrency: string, toCurrency: string) {
    const response = await axios.get(`${alphaVantageUrl}query?function=CURRENCY_EXCHANGE_RATE&from_currency=${fromCurrency}&to_currency=${toCurrency}&apikey=${apiKey}`);
    return response.data['Realtime Currency Exchange Rate']['5. Exchange Rate'];
}

function filterCompaniesByCurrencies(earningsData: CompanyData[], currencies: string | string[] | undefined) {
    if (!currencies) {
        return earningsData;
    }
    const currencyList = Array.isArray(currencies) ? currencies : [currencies];
    return earningsData.filter(company => currencyList.includes(company.currency));
}

async function calculateAverageEarnings(companies: CompanyData[], targetCurrency: string) {
    const exchangeRate = await fetchExchangeRate(companies[0].currency, targetCurrency);

    if (isNaN(parseFloat(exchangeRate))) {
        console.log('Invalid exchange rate:', exchangeRate);
        throw new Error('Invalid exchange rate');
    }

    const validCompanies = companies.filter(company => !isNaN(parseFloat(company.estimate)));

    if (validCompanies.length === 0) {
        console.log('No valid estimate values found');
        throw new Error('No valid estimate values found');
    }

    const exchangeRateFactor = parseFloat(exchangeRate);
    const convertedEarnings = validCompanies.map(company => parseFloat(company.estimate) * exchangeRateFactor);

    const totalEarnings = convertedEarnings.reduce((total, earning) => total + earning, 0);
    const averageEarnings = totalEarnings / convertedEarnings.length;

    return averageEarnings;
}

function findNearestMonthCompanies(companies: CompanyData[]): CompanyData[] {
    const currentDate = new Date();
    let nearestMonthDiff = Infinity;
    let nearestMonthCompanies: CompanyData[] = [];

    for (const company of companies) {
        const reportDate = new Date(company.reportDate);
        const monthDiff = Math.abs(currentDate.getMonth() - reportDate.getMonth());

        if (monthDiff < nearestMonthDiff) {
            nearestMonthDiff = monthDiff;
            nearestMonthCompanies = [company];
        } else if (monthDiff === nearestMonthDiff) {
            nearestMonthCompanies.push(company);
        }
    }

    return nearestMonthCompanies;
}