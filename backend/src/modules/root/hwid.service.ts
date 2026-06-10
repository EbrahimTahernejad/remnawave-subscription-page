import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AxiosService } from '@common/axios/axios.service';

interface HwidDevice {
    hwid: string;
    userUuid: string;
    platform: string | null;
    osVersion: string | null;
    deviceModel: string | null;
    userAgent: string | null;
    createdAt: string;
    updatedAt: string;
}

function parseInterval(s: string): number {
    const match = s.match(/^(\d+)(d|h|m)$/i);
    if (!match) return 3 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    switch (match[2].toLowerCase()) {
        case 'd':
            return value * 24 * 60 * 60 * 1000;
        case 'h':
            return value * 60 * 60 * 1000;
        case 'm':
            return value * 60 * 1000;
        default:
            return 3 * 24 * 60 * 60 * 1000;
    }
}

@Injectable()
export class HwidService {
    private readonly logger = new Logger(HwidService.name);
    private readonly allowDeviceReset: boolean;
    private readonly listDevices: boolean;
    private readonly allowDeviceDeleteIntervalMs: number;
    private readonly internalJwtSecret: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly axiosService: AxiosService,
    ) {
        this.allowDeviceReset = this.configService.getOrThrow<boolean>('ALLOW_DEVICE_RESET');
        this.listDevices = this.configService.getOrThrow<boolean>('LIST_DEVICES');
        this.allowDeviceDeleteIntervalMs = parseInterval(
            this.configService.getOrThrow<string>('ALLOW_DEVICE_DELETE_INTERVAL'),
        );
        this.internalJwtSecret = this.configService.getOrThrow<string>('INTERNAL_JWT_SECRET');
    }

    private verifySession(req: Request): boolean {
        const cookie = (req as Request & { cookies: Record<string, string> }).cookies?.session;
        if (!cookie) return false;
        try {
            jwt.verify(cookie, this.internalJwtSecret);
            return true;
        } catch {
            return false;
        }
    }

    private async resolveUser(
        clientIp: string,
        shortUuid: string,
    ): Promise<{ uuid: string; hwidDeviceLimit: number } | null> {
        const result = await this.axiosService.getUserByShortUuid(clientIp, shortUuid);
        if (!result.isOk || !result.response) return null;
        return result.response;
    }

    public async getDevices(
        clientIp: string,
        req: Request,
        res: Response,
        shortUuid: string,
    ): Promise<void> {
        if (!this.verifySession(req)) {
            res.socket?.destroy();
            return;
        }

        if (!this.allowDeviceReset) {
            res.json({ enabled: false });
            return;
        }

        const user = await this.resolveUser(clientIp, shortUuid);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (!user.hwidDeviceLimit || user.hwidDeviceLimit === 0) {
            res.json({ enabled: false });
            return;
        }

        if (!this.listDevices) {
            res.json({
                enabled: true,
                listDevices: false,
                hwidDeviceLimit: user.hwidDeviceLimit,
                allowDeviceDeleteIntervalMs: this.allowDeviceDeleteIntervalMs,
                devices: [],
            });
            return;
        }

        const devicesResult = await this.axiosService.getHwidDevices(user.uuid);
        if (!devicesResult.isOk || !devicesResult.response) {
            res.status(500).json({ error: 'Failed to fetch devices' });
            return;
        }

        res.json({
            enabled: true,
            listDevices: true,
            hwidDeviceLimit: user.hwidDeviceLimit,
            allowDeviceDeleteIntervalMs: this.allowDeviceDeleteIntervalMs,
            devices: devicesResult.response.devices,
        });
    }

    public async resetAll(
        clientIp: string,
        req: Request,
        res: Response,
        shortUuid: string,
    ): Promise<void> {
        if (!this.verifySession(req)) {
            res.socket?.destroy();
            return;
        }

        if (!this.allowDeviceReset) {
            res.status(403).json({ error: 'Feature disabled' });
            return;
        }

        const user = await this.resolveUser(clientIp, shortUuid);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (!user.hwidDeviceLimit || user.hwidDeviceLimit === 0) {
            res.status(403).json({ error: 'HWID not enabled for this user' });
            return;
        }

        const result = await this.axiosService.deleteAllHwidDevices(user.uuid);
        if (!result.isOk) {
            res.status(500).json({ error: 'Failed to reset devices' });
            return;
        }

        res.json({ success: true });
    }

    public async deleteOne(
        clientIp: string,
        req: Request,
        res: Response,
        shortUuid: string,
        hwid: string,
    ): Promise<void> {
        if (!this.verifySession(req)) {
            res.socket?.destroy();
            return;
        }

        if (!this.allowDeviceReset) {
            res.status(403).json({ error: 'Feature disabled' });
            return;
        }

        const user = await this.resolveUser(clientIp, shortUuid);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (!user.hwidDeviceLimit || user.hwidDeviceLimit === 0) {
            res.status(403).json({ error: 'HWID not enabled for this user' });
            return;
        }

        const devicesResult = await this.axiosService.getHwidDevices(user.uuid);
        if (!devicesResult.isOk || !devicesResult.response) {
            res.status(500).json({ error: 'Failed to fetch devices' });
            return;
        }

        const device = devicesResult.response.devices.find((d: HwidDevice) => d.hwid === hwid);
        if (!device) {
            res.status(404).json({ error: 'Device not found' });
            return;
        }

        const deviceAge = Date.now() - new Date(device.createdAt).getTime();
        if (deviceAge < this.allowDeviceDeleteIntervalMs) {
            res.json({ canDelete: false, error: 'Device is too new to delete' });
            return;
        }

        const result = await this.axiosService.deleteHwidDevice(user.uuid, hwid);
        if (!result.isOk) {
            res.status(500).json({ error: 'Failed to delete device' });
            return;
        }

        res.json({ success: true });
    }
}
