import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'omnibot:isPublic';
/** Opts a route out of the global AuthGuard. Every route is authenticated unless marked @Public(). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
