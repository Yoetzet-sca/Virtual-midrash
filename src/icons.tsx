type P = { size?: number; fill?: string; stroke?: string };
const S = ({ size = 24, fill = 'none', stroke = 'currentColor', children, w = 2 }: P & { children: React.ReactNode; w?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
export const IHome = (p: P) => <S {...p}><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></S>;
export const ICal = (p: P) => <S {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4" /></S>;
export const ISearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></S>;
export const IPeople = (p: P) => <S {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-6 6.500-6s6.500 2.500 6.500 6" /><path d="M16 4.500a3.500 3.500 0 0 1 0 7M18 14.500c2.200.700 3.500 2.800 3.500 5.500" /></S>;
export const IHeart = (p: P) => <S {...p}><path d="M12 20s-7-4.500-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.500-7 10-7 10z" /></S>;
export const ISave = (p: P) => <S {...p}><path d="M6 3h12v18l-6-4.500L6 21z" /></S>;
export const IShare = (p: P) => <S {...p}><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></S>;
export const IGift = (p: P) => <S {...p}><rect x="4.5" y="11" width="15" height="9" rx="1" /><rect x="3" y="7.5" width="18" height="3.5" rx="1" /><path d="M12 7.500V20" /><path d="M12 7.500C10 3.300 6.300 3.800 7 6c.4 1.200 2.400 1.500 5 1.500z" /><path d="M12 7.500c2-4.200 5.700-3.700 5-1.500-.4 1.200-2.400 1.500-5 1.500z" /></S>;
export const IBack = (p: P) => <S {...p} w={2.5}><path d="M15 6l-6 6 6 6" /></S>;
export const IChevron = (p: P) => <S {...p}><path d="M9 6l6 6-6 6" /></S>;
export const IPlay = ({ size = 24, fill = 'currentColor' }: P) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill}><path d="M8 4l12 8-12 8z" /></svg>;
export const IPause = ({ size = 24, fill = 'currentColor' }: P) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill}><rect x="6" y="4" width="4.5" height="16" rx="1" /><rect x="13.5" y="4" width="4.5" height="16" rx="1" /></svg>;
export const ISaved = (p: P) => <S {...p}><path d="M7 3h10v18l-5-3.800L7 21z" /><path d="M10 8h4" /></S>;
