import { test, expect, describe, vi, afterEach } from 'vitest'
import { getProfileCard, loadUser, loadSettings, getDeliveryChannel, sendWelcome, getProfileName, readChannel, recordDelivery, deliveryNotice, getNotice } from '../index'

describe('getProfileCard', () =>{
    test('Готовит карточку после загрузки профиля', async () => {
        const repository = {
            findById: async () => ({ id: 7, firstName: 'Name', lastName: 'lastName'})
        }

        const pending = getProfileCard(7, repository)
        const card = await pending

        expect(card).toEqual({ id: 7, displayName: 'Name lastName'})
    })
})

describe('loadUser', () => {
    test('Возвращает найденного пользователя', async () => {
        const repository = { findById: async (id) => ({ id, name: 'Name'})}

        const actual = await loadUser(7, repository)

        expect(actual).toEqual({ id: 7, name: 'Name' })
    })

    test('Отсутствие пользователя преобразует в ошибку приложения', async () => {
        const repository = { findById: async () => null }
        await expect(loadUser(99, repository)).rejects.toThrow('USER_NOT_FOUND')
    })

    test('Не скрывает сбой хранилища', async () => {
        const repository = { findById: async () => { throw new Error('DB_UNAVAILABLE') }}
        await expect(loadUser(7, repository)).rejects.toThrow('DB_UNAVAILABLE')
    })

    test('Не дожидается утверждщения о загрузке пользователя', async () => {
        const repository = { findById: async (id) => ({ id, name: 'Name'})}

        await expect(loadUser(7, repository)).resolves.toEqual({ id: 7, name: 'Name' })
    })
})

describe('loadSettings', () => {
    test('Отключенные уведомления являются корректными настройками', async () => {
        const repository = { findById: async () => ({ enabled: false, channel: 'email' })}

        await expect(loadSettings(7, repository)).resolves.toEqual({ enabled: false, channel: 'email' })
    })

    test('Проверка на отсутствие настроек', async () => {
        const repository = { findById: async () => null }

        await expect(loadSettings(8, repository)).rejects.toThrow('SETTINGS_NOT_FOUND')
    })
})

describe('getDeliveryChannel', () => {
    test('Отклоняет неправильный канал', async () => {
        const repository = { getPreferences: async () => ({ channel: 'fax' }) }

        await expect(getDeliveryChannel(7, repository)).rejects.toThrow('UNSUPPORTED_CHANNEL')
    })

    test('Ручной catch', async () => {
        expect.assertions(1)

        const repository = { getPreferences: async () => ({ channel: 'fax' })}

        try {
            await getDeliveryChannel(7, repository)
        } catch (error) {
            expect(error.message).toBe('UNSUPPORTED_CHANNEL')
        }
    })

    test('Поддерживаемый канал связи', async () => {
        const repository = { getPreferences: async () => ({ channel: 'email' })}
        await expect(getDeliveryChannel(7, repository)).resolves.toBe('email')
    })
})

describe('sendWelcome', () => {
    test('Возвращает результат отправленного письма', async () => {
        const service = {
            getPreferences: async () => ({ enabled: true, email: 'test@test.com' }),
            sendEmail: async () => ({ id: 1 })
        }

        await expect(sendWelcome(7, service)).resolves.toEqual({ status: 'sent', messageId: 1 })
    })

    test('При запрете не отправляет письмо', async () => {
        const service = {
            getPreferences: async () => ({ enabled: false, email: 'test@test.com' }),
            sendEmail: async () => {throw new Error('UNEXPECTED_ERROR')}
        }

        await expect(sendWelcome(7, service)).resolves.toEqual({ status: 'skipped' })
    })

    test('Произошла ошибка отправки письма', async () => {
        const service = {
            getPreferences: async () => ({ enabled: true, email: 'test@test.com' }),
            sendEmail: async () => {throw new Error('UNEXPECTED_ERROR')}
        }

        await expect(sendWelcome(7, service)).rejects.toThrow('UNEXPECTED_ERROR')
    })
})

describe('getProfileName', () => {
    test('Получает имя', async () => {
        const service = { getProfile: async () => ({name: 'Name'})}
        await expect(getProfileName(1, service)).resolves.toEqual('Name')
    })

    test('Вернется гость', async () => {
        const service = { getProfile: async () => null}
        await expect(getProfileName(1, service)).resolves.toEqual('Гость')
    })

    test('Ошибка', async () => {
        const service = {getProfile: async () =>{throw new Error('UNEXPECTED_ERROR')} }
        await expect(getProfileName(1, service)).rejects.toThrow("UNEXPECTED_ERROR")
    })

    test('Catch ошибки', async () => {
        const service = {getProfile: async () =>{throw new Error('UNEXPECTED_ERROR')} }
        try {
            await getProfileName(1, service)
        } catch (error) {
            expect(error.message).toBe('UNEXPECTED_ERROR')
        }
    })
})

describe('readChannel', () => {
    test('Выбирает разрешенный канал для нужного пользователя', async () => {
        const getPreferences = vi.fn().mockResolvedValue({ enabled: true, channel: 'email' })
        await expect(readChannel(7, getPreferences)).resolves.toBe('email')

        expect(getPreferences).toHaveBeenCalledTimes(1)
        expect(getPreferences).toHaveBeenCalledWith(7)
    })

    test('При отключенных уведомлениях канала связи нет', async () => {
        const getPreferences = vi.fn().mockResolvedValue({ enabled: false, channel: 'email' })
        await expect(readChannel(7, getPreferences)).resolves.toBeNull()
    })

    test('Сбой загрузки не превращается в запрет уведомлений', async () => {
        const getPreferences = vi.fn().mockRejectedValue(new Error('UNAVAILABLE'))

        await expect(readChannel(7, getPreferences)).rejects.toThrow('UNAVAILABLE')
    })
})

describe('recordDelivery', () => {
    afterEach(() => vi.restoreAllMocks())

    test('Наблюдает за работающим адаптером аудита', () => {
        const records = []

        const audit = {
            append(event) {
                const record = { id: `audit-${records.length+1}`, ...event}
                records.push(record)
                return record
            }
        }

        const spy = vi.spyOn(audit, 'append')

        const event = { event: 'notification.delivered', messageId: 'm-1', userId: 7 }

        expect(recordDelivery(audit, 'm-1', 7)).toEqual({ id: 'audit-1', ...event })
        expect(spy).toHaveBeenCalledWith(event)
        expect(records).toEqual([{ id: 'audit-1', ...event}])
    })

    test('При подмене метода запись в адаптер не выполняется', () => {
        const records = []
        const audit = {
            append(event) {
                const record = { id: `audit-${records.length+1}`, ...event}
                records.push(record)
                return record
            }
        }

        const returnedRecord = {
            id: 'audit-test', event: 'notification.delivered', messageId: 'm-2', userId: 8
        }

        const spy = vi.spyOn(audit, 'append').mockReturnValue(returnedRecord)

        expect(recordDelivery(audit, 'm-2', 8)).toEqual(returnedRecord)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(records).toEqual([])
    })
})

describe('deliveryNotice', () => {
    test('Получает настройки по id и отправляет по по адресу из нстроек', async () => {
        const dependancies = {
            getPreferences: vi.fn().mockResolvedValue({
                enabled: true, channel: 'email', address: 'test@test.com'
            }),
            send: vi.fn().mockResolvedValue({ id: 'm-10' })
        }

        await expect(deliveryNotice(7, 'Some text', dependancies)).resolves.toEqual({ status: 'sent', messageId: 'm-10'})

        expect(dependancies.getPreferences).toHaveBeenCalledWith(7)
        expect(dependancies.send).toHaveBeenCalledTimes(1)
        expect(dependancies.send).toHaveBeenCalledWith({
            to: 'test@test.com', channel: 'email', text: 'Some text'
        })
    })

    test('При запрете не вызывает отправителя', async () => {
        const dependancies = {
            getPreferences: vi.fn().mockResolvedValue({ enabled: false }),
            send: vi.fn()
        }
        await expect(deliveryNotice(7, 'Some text', dependancies)).resolves.toEqual({ status: 'skipped' })

        expect(dependancies.send).not.toHaveBeenCalled()
    })

    test('Передает отказ отправителя', async () => {
        const dependancies = {
            getPreferences: vi.fn().mockResolvedValue({
                enabled: true, channel: 'email', address: 'test@test.com'
            }),
            send: vi.fn().mockRejectedValue(new Error('SEND_FAILED'))
        }
        
        await expect(deliveryNotice(7, 'Some text', dependancies)).rejects.toThrow('SEND_FAILED')
    })
})

describe('getNotice', () => {
    afterEach(() => vi.unstubAllGlobals())

    test('Читает и проверяет данные уведомления', async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({
            id: 3, text: 'Some text', internalNotice: 'Not shown'
        }))

        vi.stubGlobal('fetch', fetchMock)

        await expect(getNotice(3)).resolves.toEqual({ id: 3, text: 'Some text'})
        expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/notices/3')
    })

    test('HTTP 503', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response("", { status: 503})))
        await expect(getNotice(3)).rejects.toThrow('HTTP_503')
    })
})