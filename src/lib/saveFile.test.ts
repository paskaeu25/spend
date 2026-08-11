import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveFile } from './saveFile'

const writeFile = vi.fn(async ({ path }: { path: string }) => ({ uri: `file:///cache/${path}` }))
const share = vi.fn(async (_options: unknown) => ({ activityType: '' }))

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: (options: { path: string }) => writeFile(options) },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}))

vi.mock('@capacitor/share', () => ({
  Share: { share: (options: unknown) => share(options as never) },
}))

function pretendNative() {
  Object.defineProperty(globalThis, 'Capacitor', {
    configurable: true,
    value: { isNativePlatform: () => true },
  })
}

afterEach(() => {
  delete (globalThis as { Capacitor?: unknown }).Capacitor
  writeFile.mockClear()
  share.mockClear()
})

describe('saveFile', () => {
  it('clicks a download link in a browser', async () => {
    const url = 'blob:test'
    URL.createObjectURL = vi.fn(() => url)
    URL.revokeObjectURL = vi.fn()
    const clicks: string[] = []
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this.download)
      })

    await expect(saveFile('spend.csv', 'a,b', 'text/csv')).resolves.toBe('downloaded')
    expect(clicks).toEqual(['spend.csv'])
    expect(writeFile).not.toHaveBeenCalled()
    click.mockRestore()
  })

  /*
   * The bug this covers: inside the Capacitor WebView an <a download> click is a
   * silent no-op, so both export buttons did nothing at all on Android.
   */
  it('writes the file and opens the share sheet on native', async () => {
    pretendNative()

    await expect(saveFile('spend.json', '{}', 'application/json')).resolves.toBe('shared')

    expect(writeFile).toHaveBeenCalledWith({
      path: 'spend.json',
      data: '{}',
      directory: 'CACHE',
      encoding: 'utf8',
    })
    expect(share).toHaveBeenCalledWith({
      title: 'spend.json',
      files: ['file:///cache/spend.json'],
    })
  })

  it('treats a dismissed share sheet as a choice, not a failure', async () => {
    pretendNative()
    share.mockRejectedValueOnce(new Error('Share canceled'))

    await expect(saveFile('spend.csv', 'a,b', 'text/csv')).resolves.toBe('cancelled')
  })

  it('surfaces a real write failure', async () => {
    pretendNative()
    writeFile.mockRejectedValueOnce(new Error('quota'))

    await expect(saveFile('spend.csv', 'a,b', 'text/csv')).rejects.toThrow('quota')
    expect(share).not.toHaveBeenCalled()
  })
})
