export async function getProfileCard(userId, repository) {
    const profile = await repository.findById(userId)

    if (profile === null) return null

    return { id: profile.id, displayName: `${profile.firstName} ${profile.lastName}`}
}

export async function loadUser(id, repository) {
    const user = await repository.findById(id)

    if (user === null) throw new Error('USER_NOT_FOUND')

    return user
}

export async function loadSettings(userId, repository) {
    const settings = await repository.findById(userId)

    if (settings === null) throw new Error('SETTINGS_NOT_FOUND')

    return settings
}

export async function getDeliveryChannel(userId, repository) {
    const settings = await repository.getPreferences(userId)

    if(!['email', 'tg'].includes(settings.channel)) {
        throw new Error('UNSUPPORTED_CHANNEL')
    }

    return settings.channel
}

export async function sendWelcome(userId, service) {
    const preferences = await service.getPreferences(userId)

    if(!preferences.enabled) {
        return { status: 'skipped' }
    }

    const message = await service.sendEmail({
        to: preferences.email,
        subject: 'Welcome',
        text: 'Welcome',
    })

    return { status: 'sent', messageId: message.id}
}

export async function getProfileName(id, service) {
    const result = await service.getProfile(id)
    if (result === null) {
        return 'Гость'
    } else {
        return result.name
    }   
}

export async function readChannel(userId, getPreferences) {
    const preferences = await getPreferences(userId)

    return preferences.enabled ? preferences.channel : null
}

export function recordDelivery(audit, messageId, userId) {
    return audit.append({ event: 'notification.delivered', messageId, userId })
}

export async function deliveryNotice(userId, text, dependancies) {
    const preferences = await dependancies.getPreferences(userId)

    if(!preferences.enabled) {
        return { status: 'skipped' }
    }

    const result = await dependancies.send({
        to: preferences.address, channel: preferences.channel, text
    })

    return { status: 'sent', messageId: result.id }
}

export async function getNotice(id, {
    baseUrl = "https://example.test", fetchImpl = globalThis.fetch
} = {}
) {
    const response = await fetchImpl(new URL(`/api/notices/${id}`, baseUrl).href)
    if (!response.ok) throw new Error(`HTTP_${response.status}`)

    const data = await response.json()

    if (data === null || data.id !== id || typeof data.text !== 'string') {
        throw new Error('INVALID_NOTICE')
    }

    return { id: data.id, text: data.text }
}