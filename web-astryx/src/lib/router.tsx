import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { Link as RouterLinkBase } from 'react-router-dom';

/**
 * Cầu nối cho <LinkProvider>: mọi <Link>, <SideNavItem href>, <Button href> của Astryx
 * đi qua đây. Astryx trao `href` (+ className/style/children/onClick…); ta đổi sang
 * `to` của react-router để điều hướng phía client, không nạp lại trang.
 *
 * Link ngoài (http…), mailto/tel, hoặc neo (#) rơi về <a> thường.
 */
const EXTERNAL = /^([a-z][\w+.-]*:)?\/\/|^(mailto:|tel:|#)/i;

interface RouterLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
    href?: string;
}

export const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(function RouterLink(
    { href = '', ...rest },
    ref,
) {
    if (!href || EXTERNAL.test(href)) {
        return <a ref={ref} href={href || undefined} {...rest} />;
    }
    return <RouterLinkBase ref={ref} to={href} {...rest} />;
});
