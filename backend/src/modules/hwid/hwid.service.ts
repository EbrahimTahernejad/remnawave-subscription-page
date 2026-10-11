import { Request, Response } from 'express';

import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AxiosService } from '@common/axios';
import { TypedConfigService } from '@common/config/app-config';

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

    constructor(
        private readonly configService: TypedConfigService,
        private readonly axiosService: AxiosService,
        private readonly jwtService: JwtService,
    ) {
        this.allowDeviceReset = this.configService.getOrThrow('ALLOW_DEVICE_RESET');
        this.listDevices = this.configService.getOrThrow('LIST_DEVICES');
        this.allowDeviceDeleteIntervalMs = parseInterval(
            this.configService.getOrThrow('ALLOW_DEVICE_DELETE_INTERVAL'),
        );
    }

    private verifySession(req: Request): boolean {
        const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.session;
        if (!cookie) return false;
        try {
            this.jwtService.verify(cookie);
            return true;
        } catch {
            return false;
        }
    }

    private async resolveUser(
        clientIp: string,
        shortUuid: string,
    ): Promise<{ id: number; hwidDeviceLimit: number | null } | null> {
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

        if (!user.hwidDeviceLimit) {
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

        const devicesResult = await this.axiosService.getUserHwidDevices(user.id);
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

        if (!user.hwidDeviceLimit) {
            res.status(403).json({ error: 'HWID not enabled for this user' });
            return;
        }

        const result = await this.axiosService.deleteAllUserHwidDevices(user.id);
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

        if (!user.hwidDeviceLimit) {
            res.status(403).json({ error: 'HWID not enabled for this user' });
            return;
        }

        const devicesResult = await this.axiosService.getUserHwidDevices(user.id);
        if (!devicesResult.isOk || !devicesResult.response) {
            res.status(500).json({ error: 'Failed to fetch devices' });
            return;
        }

        const device = devicesResult.response.devices.find((d) => d.hwid === hwid);
        if (!device) {
            res.status(404).json({ error: 'Device not found' });
            return;
        }

        const deviceAge = Date.now() - new Date(device.createdAt).getTime();
        if (deviceAge < this.allowDeviceDeleteIntervalMs) {
            res.json({ canDelete: false, error: 'Device is too new to delete' });
            return;
        }

        const result = await this.axiosService.deleteUserHwidDevice(user.id, hwid);
        if (!result.isOk) {
            this.logger.error(`Failed to delete HWID device for user ${user.id}`);
            res.status(500).json({ error: 'Failed to delete device' });
            return;
        }

        res.json({ success: true });
    }
}
