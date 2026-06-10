import {
    ActionIcon,
    Badge,
    Button,
    Card,
    Group,
    ScrollArea,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { IconDevices, IconDevicesOff, IconRefresh, IconTrash } from '@tabler/icons-react'
import { ofetch } from 'ofetch'
import { useCallback, useEffect, useState } from 'react'

import { useSubscription } from '@entities/subscription-info-store'

interface HwidDevice {
    hwid: string
    userUuid: string
    platform: string | null
    osVersion: string | null
    deviceModel: string | null
    userAgent: string | null
    createdAt: string
    updatedAt: string
}

interface HwidState {
    enabled: boolean
    listDevices?: boolean
    hwidDeviceLimit?: number
    allowDeviceDeleteIntervalMs?: number
    devices?: HwidDevice[]
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    } catch {
        return iso
    }
}

function deviceLabel(device: HwidDevice): string {
    if (device.deviceModel) return device.deviceModel
    if (device.userAgent) return device.userAgent.substring(0, 40)
    return device.hwid.substring(0, 12) + '...'
}

export const HwidDevicesWidget = () => {
    const subscription = useSubscription()
    const shortUuid = subscription.user.shortUuid

    const [state, setState] = useState<HwidState | null>(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)

    const fetchDevices = useCallback(async () => {
        try {
            const data = await ofetch<HwidState>(`/${shortUuid}/hwid`, {
                parseResponse: (r) => JSON.parse(r)
            })
            setState(data)
        } catch {
            setState({ enabled: false })
        } finally {
            setLoading(false)
        }
    }, [shortUuid])

    useEffect(() => {
        fetchDevices()
    }, [fetchDevices])

    const handleReset = () => {
        modals.openConfirmModal({
            title: 'Reset all devices',
            centered: true,
            children: (
                <Text size="sm">
                    This will remove all registered devices from your account. Your next connection
                    will re-register the device automatically.
                </Text>
            ),
            labels: { confirm: 'Reset', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                setActionLoading(true)
                try {
                    await ofetch(`/${shortUuid}/hwid/reset`, { method: 'POST' })
                    await fetchDevices()
                } catch {
                    // ignore
                } finally {
                    setActionLoading(false)
                }
            }
        })
    }

    const handleDelete = (device: HwidDevice) => {
        modals.openConfirmModal({
            title: 'Remove device',
            centered: true,
            children: (
                <Text size="sm">
                    Remove <b>{deviceLabel(device)}</b> from your account?
                </Text>
            ),
            labels: { confirm: 'Remove', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                setActionLoading(true)
                try {
                    await ofetch(`/${shortUuid}/hwid/delete`, {
                        method: 'POST',
                        body: { hwid: device.hwid }
                    })
                    await fetchDevices()
                } catch {
                    // ignore
                } finally {
                    setActionLoading(false)
                }
            }
        })
    }

    if (loading) {
        return (
            <Card p={{ base: 'sm', xs: 'md', sm: 'lg', md: 'xl' }} radius="lg">
                <Stack gap="md">
                    <Skeleton height={24} width={160} />
                    <Skeleton height={48} />
                </Stack>
            </Card>
        )
    }

    if (!state?.enabled) return null

    const { listDevices, hwidDeviceLimit, allowDeviceDeleteIntervalMs, devices } = state
    const deviceCount = devices?.length ?? 0
    const now = Date.now()

    return (
        <Card p={{ base: 'sm', xs: 'md', sm: 'lg', md: 'xl' }} radius="lg">
            <Stack gap="md">
                <Group gap="sm" justify="space-between">
                    <Group gap="sm">
                        <Title c="white" fw={600} order={4}>
                            Devices
                        </Title>
                        {listDevices && hwidDeviceLimit !== undefined && (
                            <Badge color="cyan" size="lg" variant="light">
                                {deviceCount} / {hwidDeviceLimit}
                            </Badge>
                        )}
                    </Group>
                    <Button
                        color="red"
                        disabled={actionLoading || deviceCount === 0}
                        leftSection={<IconRefresh size={16} />}
                        onClick={handleReset}
                        size="xs"
                        variant="light"
                    >
                        Reset all
                    </Button>
                </Group>

                {listDevices && (
                    <>
                        {deviceCount === 0 ? (
                            <Group c="dimmed" gap="xs" justify="center" py="sm">
                                <IconDevicesOff size={18} />
                                <Text size="sm">No devices registered</Text>
                            </Group>
                        ) : (
                            <ScrollArea.Autosize mah={300} scrollbars="y">
                                <Stack gap="xs">
                                    {(devices ?? []).map((device) => {
                                        const ageMs =
                                            now - new Date(device.createdAt).getTime()
                                        const canDelete =
                                            allowDeviceDeleteIntervalMs === undefined ||
                                            ageMs >= allowDeviceDeleteIntervalMs

                                        return (
                                            <Card
                                                key={device.hwid}
                                                padding="xs"
                                                radius="md"
                                                withBorder
                                            >
                                                <Group justify="space-between" wrap="nowrap">
                                                    <Group gap="xs" wrap="nowrap">
                                                        <IconDevices
                                                            size={16}
                                                            style={{
                                                                color: 'var(--mantine-color-cyan-4)',
                                                                flexShrink: 0
                                                            }}
                                                        />
                                                        <Stack gap={2}>
                                                            <Text
                                                                c="white"
                                                                fw={500}
                                                                size="sm"
                                                                truncate
                                                            >
                                                                {deviceLabel(device)}
                                                            </Text>
                                                            <Group gap={6}>
                                                                {device.platform && (
                                                                    <Badge
                                                                        color="gray"
                                                                        size="xs"
                                                                        variant="light"
                                                                    >
                                                                        {device.platform}
                                                                    </Badge>
                                                                )}
                                                                <Text c="dimmed" size="xs">
                                                                    {formatDate(device.createdAt)}
                                                                </Text>
                                                            </Group>
                                                        </Stack>
                                                    </Group>

                                                    <Tooltip
                                                        disabled={canDelete}
                                                        label="Device is too new to remove"
                                                        withArrow
                                                    >
                                                        <ActionIcon
                                                            color="red"
                                                            disabled={
                                                                !canDelete || actionLoading
                                                            }
                                                            onClick={() => handleDelete(device)}
                                                            size="sm"
                                                            variant="subtle"
                                                        >
                                                            <IconTrash size={14} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                </Group>
                                            </Card>
                                        )
                                    })}
                                </Stack>
                            </ScrollArea.Autosize>
                        )}
                    </>
                )}
            </Stack>
        </Card>
    )
}
