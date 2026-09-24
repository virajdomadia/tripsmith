import { describe, expect, it } from 'vitest';
import { gateDecision, hasSessionCookie, loginHref, safeNext } from '../src/lib/auth/gate';

describe('safeNext', () => {
  it('keeps admin paths and falls back to /admin for anything else', () => {
    expect(safeNext('/admin/enquiries?status=new')).toBe('/admin/enquiries?status=new');
    expect(safeNext('/admin')).toBe('/admin');
    expect(safeNext('/')).toBe('/admin');
    expect(safeNext('//evil.example/admin')).toBe('/admin');
    expect(safeNext('https://evil.example/admin')).toBe('/admin');
    expect(safeNext('/administrator')).toBe('/admin');
    expect(safeNext('/admin/login')).toBe('/admin'); // never bounce back to the form
    expect(safeNext(undefined)).toBe('/admin');
  });

  it('normalises dot-segments and backslashes before scoping to /admin', () => {
    expect(safeNext('/admin/../x')).toBe('/admin');
    expect(safeNext('/admin/..\\..\\x')).toBe('/admin');
    expect(safeNext('/admin/packages/../enquiries')).toBe('/admin/enquiries');
    expect(safeNext('/admin#frag')).toBe('/admin');
    expect(safeNext('/admin/x?a=1#f')).toBe('/admin/x?a=1');
  });
});

describe('loginHref', () => {
  it('encodes only what is given', () => {
    expect(loginHref({})).toBe('/admin/login');
    expect(loginHref({ error: 'credentials', next: '/admin/packages', email: 'a+b@x.io' })).toBe(
      '/admin/login?error=credentials&next=%2Fadmin%2Fpackages&email=a%2Bb%40x.io',
    );
    expect(loginHref({ signedOut: true })).toBe('/admin/login?signedout=1');
  });
});

describe('gateDecision', () => {
  it('sends a signed-out visitor to the form with the target path', () => {
    expect(gateDecision('/admin/enquiries?status=new', 'anonymous')).toEqual({
      kind: 'login',
      next: '/admin/enquiries?status=new',
    });
  });
  it('lets a signed-out visitor see the form', () => {
    expect(gateDecision('/admin/login', 'anonymous')).toEqual({ kind: 'allow' });
    expect(gateDecision('/admin/login?error=credentials', 'anonymous')).toEqual({ kind: 'allow' });
  });
  it('sends a signed-in owner from the form to the dashboard', () => {
    expect(gateDecision('/admin/login', 'owner')).toEqual({ kind: 'home' });
    expect(gateDecision('/admin', 'owner')).toEqual({ kind: 'allow' });
  });
  it('sends a signed-in customer to their account, from the form too (R18)', () => {
    expect(gateDecision('/admin', 'customer')).toEqual({ kind: 'account' });
    expect(gateDecision('/admin/enquiries?status=new', 'customer')).toEqual({ kind: 'account' });
    expect(gateDecision('/admin/login', 'customer')).toEqual({ kind: 'account' });
  });
});

describe('hasSessionCookie', () => {
  it('looks for the cookie name only', () => {
    expect(hasSessionCookie('theme=dark; ts_session=abc')).toBe(true);
    expect(hasSessionCookie('ts_session_old=abc')).toBe(false);
    expect(hasSessionCookie(null)).toBe(false);
  });
});
