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
    expect(gateDecision('/admin/enquiries?status=new', false)).toEqual({
      kind: 'login',
      next: '/admin/enquiries?status=new',
    });
  });
  it('lets a signed-out visitor see the form', () => {
    expect(gateDecision('/admin/login', false)).toEqual({ kind: 'allow' });
    expect(gateDecision('/admin/login?error=credentials', false)).toEqual({ kind: 'allow' });
  });
  it('sends a signed-in owner from the form to the dashboard', () => {
    expect(gateDecision('/admin/login', true)).toEqual({ kind: 'home' });
    expect(gateDecision('/admin', true)).toEqual({ kind: 'allow' });
  });
});

describe('hasSessionCookie', () => {
  it('looks for the cookie name only', () => {
    expect(hasSessionCookie('theme=dark; ts_session=abc')).toBe(true);
    expect(hasSessionCookie('ts_session_old=abc')).toBe(false);
    expect(hasSessionCookie(null)).toBe(false);
  });
});
