import { describe, expect, it, vi } from 'vitest';
import { createDisplayOwner } from '../src/index';

const host = (current = () => true) => {
  const stop = vi.fn();
  const captureDisplayEpisode = vi.fn(() => ({
    current,
    stop,
  }));
  return {
    sdk: {
      lifecycle: {
        captureDisplayEpisode,
      },
    },
    stop,
    captureDisplayEpisode,
  };
};
describe('shared display owner', () => {
  it('captures once and admits stable work without a transport or response cache', () => {
    const h = host();
    const owner = createDisplayOwner(h.sdk);
    expect(owner.current()).toBe(true);
    owner.assertCurrent();
    expect(h.captureDisplayEpisode).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(owner)).toBe(true);
    owner.stop();
    owner.stop();
    expect(owner.current()).toBe(false);
    expect(h.stop).toHaveBeenCalledTimes(1);
  });
  it('cannot revive after host or local admission is lost', () => {
    ['host', 'local'].forEach((source) => {
      let admitted = true;
      const h = host(() => source !== 'host' || admitted);
      const onRetire = vi.fn();
      const owner = createDisplayOwner(h.sdk, {
        current: () => source !== 'local' || admitted,
        onRetire,
      });
      expect(owner.current()).toBe(true);
      admitted = false;
      expect(owner.current()).toBe(false);
      admitted = true;
      expect(owner.current()).toBe(false);
      expect(onRetire).toHaveBeenCalledTimes(1);
      expect(() => owner.assertCurrent()).toThrow(expect.objectContaining({
        code: 'DATA_RETIRED',
        retryable: false,
      }));
    });
  });
  it('fails closed for missing, malformed, throwing and nonboolean admission', () => {
    [null, {}, {
      lifecycle: {
        captureDisplayEpisode() {
          throw Error('missing');
        },
      },
    }, {
      lifecycle: {
        captureDisplayEpisode: () => ({
          current: () => true,
        }),
      },
    }, host(() => 'true').sdk, host(() => {
      throw Error('retired');
    }).sdk].forEach((sdk) => expect(createDisplayOwner(sdk).current()).toBe(false));
    expect(createDisplayOwner(host().sdk, {
      current() {
        throw Error('closed');
      },
    }).current()).toBe(false);
  });
  it('isolates disposal failures and does not cancel an accepted command', async () => {
    let acknowledge;
    const accepted = new Promise((resolve) => {
      acknowledge = resolve;
    });
    const owner = createDisplayOwner({
      lifecycle: {
        captureDisplayEpisode: () => ({
          current: () => true,
          stop() {
            throw Error('cleanup');
          },
        }),
      },
    }, {
      onRetire() {
        throw Error('consumer');
      },
    });
    owner.stop();
    acknowledge('original principal ACK');
    expect(await accepted).toBe('original principal ACK');
    expect(owner.current()).toBe(false);
  });
});
