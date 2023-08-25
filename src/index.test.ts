import { expect } from 'chai';
import * as awsSdkMock from 'aws-sdk-mock';
import { handler } from '.';

describe('Lambda Handler', () => {
    afterEach(() => {
        awsSdkMock.restore('Lambda');
    });

    it('should calculate average earnings for valid input', async () => {
        const event: any = {
            queryStringParameters: {
                cur: ['USD', 'EUR'],  
                targetCur: 'USD',
            },
        };

        awsSdkMock.mock('Lambda', 'invoke', (params: any, callback: (err: any, data: any) => void) => {
            callback(null, { Payload: JSON.stringify({ averageEarnings: 100.2 }) });
        });

        const result = await handler(event);

        const parsedResult = JSON.parse(result.body);

        expect(result.statusCode).to.equal(200);
        expect(parsedResult.averageEarnings).to.equal(100.2);
    });

    it('should handle error for invalid input', async () => {
        const event: any = {
            queryStringParameters: {},
        };

        awsSdkMock.mock('Lambda', 'invoke', (params: any, callback: (err: any, data: any) => void) => {
            callback(new Error('Some error'), null);
        });

        const result = await handler(event);
        const parsedResult = JSON.parse(result.body);

        expect(result.statusCode).to.equal(500);
        expect(parsedResult.error).to.equal('Internal Server Error');
    });
});
