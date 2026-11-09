import { Module } from '@nestjs/common';
import { ShopModule } from '../shop/shop.module.js';
import { CatalogController } from './catalog.controller.js';
import { CustomerController } from './customer.controller.js';
import { IdentityService } from './identity.service.js';

@Module({ imports: [ShopModule], controllers: [CatalogController, CustomerController], providers: [IdentityService], exports: [IdentityService] })
export class CatalogModule {}
