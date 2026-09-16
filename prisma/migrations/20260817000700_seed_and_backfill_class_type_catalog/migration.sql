-- ============================================================
-- ClassType production-safe seed + legacy backfill
-- ============================================================
-- Safe for environments where the catalog already exists:
--   - ClassType keys are unique
--   - aliases are unique
--   - existing explicit classTypeId values are preserved
--   - OfferAllowedClass uses INSERT IGNORE on (offerId, classId)
-- ============================================================


-- ------------------------------------------------------------
-- 1. Canonical ClassType catalog
-- ------------------------------------------------------------

INSERT IGNORE INTO `ClassType`
(`id`,`key`,`nameAr`,`nameEn`,`isActive`,`sortOrder`,`createdAt`,`updatedAt`)
VALUES
(UUID(),'iron_equipment','حديد ع الاجهزة','Iron equipment',TRUE,10,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'belly_dance','رقص شرقي','Belly dance',TRUE,20,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'zumba_mix','زومبا ميكس','Zumba Mix',TRUE,30,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'fitness','فيتنس','Fitness',TRUE,40,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'kids_fitness','فيتنس أطفال','Children''s fitness',TRUE,50,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'kickboxing','كيك بوكس','Kickbox',TRUE,60,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'yoga_pilates','يوجا وبيلاتس','Yoga and Pilates',TRUE,70,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),

(UUID(),'legacy_gymnastics','جمباز','Gymnastics',FALSE,900,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'legacy_womens_kickboxing','كيك بوكسينج سيدات','Women''s Kickboxing',FALSE,910,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'legacy_yoga','يوجا','Yoga',FALSE,920,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'legacy_cardio','كارديو','Cardio',FALSE,930,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3));


-- ------------------------------------------------------------
-- 2. Historical aliases
-- ------------------------------------------------------------

INSERT IGNORE INTO `ClassTypeAlias`
(`id`,`classTypeId`,`alias`,`createdAt`)
SELECT UUID(), ct.id, x.alias, CURRENT_TIMESTAMP(3)
FROM `ClassType` ct
JOIN (
    SELECT 'iron_equipment' AS typeKey, 'حديد ع الاجهزة' AS alias
    UNION ALL SELECT 'iron_equipment','بيلدينج'
    UNION ALL SELECT 'iron_equipment','building'
    UNION ALL SELECT 'iron_equipment','Iron on devices'

    UNION ALL SELECT 'belly_dance','رقص شرقي'
    UNION ALL SELECT 'belly_dance','Belly dance'

    UNION ALL SELECT 'zumba_mix','زومبا ميكس'
    UNION ALL SELECT 'zumba_mix','Zumba Mix'
    UNION ALL SELECT 'zumba_mix','zumba'

    UNION ALL SELECT 'fitness','فيتنس'
    UNION ALL SELECT 'fitness','fitness'
    UNION ALL SELECT 'fitness','فيتنيس'

    UNION ALL SELECT 'kids_fitness','فيتنس أطفال'
    UNION ALL SELECT 'kids_fitness','Children''s fitness'

    UNION ALL SELECT 'kickboxing','كيك بوكس'
    UNION ALL SELECT 'kickboxing','Kickbox'

    UNION ALL SELECT 'yoga_pilates','يوجا وبيلاتس'
    UNION ALL SELECT 'yoga_pilates','Yoga and Pilates'

    UNION ALL SELECT 'legacy_gymnastics','جمباز'
    UNION ALL SELECT 'legacy_womens_kickboxing','كيك بوكسينج سيدات'
    UNION ALL SELECT 'legacy_yoga','يوجا'
    UNION ALL SELECT 'legacy_cardio','cardio'
) x ON x.typeKey = ct.`key`;


-- ------------------------------------------------------------
-- 3. Backfill current Class rows
-- ------------------------------------------------------------
-- Existing explicit IDs always win.

UPDATE `Class` c
INNER JOIN `ClassTypeAlias` a
    ON LOWER(TRIM(a.`alias`)) = LOWER(TRIM(c.`type`))
SET c.`classTypeId` = a.`classTypeId`
WHERE c.`classTypeId` IS NULL;


-- ------------------------------------------------------------
-- 4. Backfill legacy OfferAllowedClassType rows
-- ------------------------------------------------------------

UPDATE `OfferAllowedClassType` oact
INNER JOIN `ClassTypeAlias` a
    ON LOWER(TRIM(a.`alias`)) = LOWER(TRIM(oact.`classType`))
SET oact.`classTypeId` = a.`classTypeId`
WHERE oact.`classTypeId` IS NULL;


-- ------------------------------------------------------------
-- 5. Rebuild exact Class-ID entitlement for SPECIAL offers
-- ------------------------------------------------------------
-- 006 may already have inserted exact textual matches.
-- Running this again after the stable-ID backfill also resolves aliases such
-- as "بيلدينج". UNIQUE(offerId,classId) keeps this idempotent.

INSERT IGNORE INTO `OfferAllowedClass`
(`id`,`offerId`,`classId`,`createdAt`)
SELECT
    UUID(),
    oact.`offerId`,
    c.`id`,
    CURRENT_TIMESTAMP(3)
FROM `OfferAllowedClassType` oact
INNER JOIN `Offer` o
    ON o.`id` = oact.`offerId`
INNER JOIN `Class` c
    ON oact.`classTypeId` IS NOT NULL
   AND c.`classTypeId` = oact.`classTypeId`
WHERE o.`type` = 'special';
