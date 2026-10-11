import { Request, Response } from 'express';

import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';

import { ClientIp } from '@common/decorators/get-ip';

import { HwidService } from './hwid.service';

// The list route has three segments so it never matches the ':shortUuid/:clientType'
// subscription route (and its client-type / Marzban middlewares).
@Controller(':shortUuid/hwid')
export class HwidController {
    constructor(private readonly hwidService: HwidService) {}

    @Get('devices')
    async getDevices(
        @ClientIp() clientIp: string,
        @Req() request: Request,
        @Res() response: Response,
        @Param('shortUuid') shortUuid: string,
    ) {
        return await this.hwidService.getDevices(clientIp, request, response, shortUuid);
    }

    @Post('reset')
    async resetDevices(
        @ClientIp() clientIp: string,
        @Req() request: Request,
        @Res() response: Response,
        @Param('shortUuid') shortUuid: string,
    ) {
        return await this.hwidService.resetAll(clientIp, request, response, shortUuid);
    }

    // hwid goes in the path: the global header filter strips content-length, so request
    // bodies never reach the body parser.
    @Post('delete/:hwid')
    async deleteDevice(
        @ClientIp() clientIp: string,
        @Req() request: Request,
        @Res() response: Response,
        @Param('shortUuid') shortUuid: string,
        @Param('hwid') hwid: string,
    ) {
        return await this.hwidService.deleteOne(clientIp, request, response, shortUuid, hwid);
    }
}
