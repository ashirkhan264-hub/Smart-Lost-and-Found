IF DB_ID(N'lostfound_db') IS NULL
BEGIN
    CREATE DATABASE lostfound_db;
END;
GO

USE lostfound_db;
GO

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_users PRIMARY KEY,
        name NVARCHAR(120) NOT NULL,
        email VARCHAR(254) NOT NULL CONSTRAINT UQ_users_email UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CONSTRAINT DF_users_role DEFAULT ('user'),
        blocked BIT NOT NULL CONSTRAINT DF_users_blocked DEFAULT (0),
        CONSTRAINT CK_users_role CHECK (role IN ('user', 'admin'))
    );
END;
GO

IF OBJECT_ID(N'dbo.items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.items (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_items PRIMARY KEY,
        type VARCHAR(10) NOT NULL,
        title NVARCHAR(200) NOT NULL,
        category NVARCHAR(80) NOT NULL,
        color NVARCHAR(40) NOT NULL,
        location NVARCHAR(120) NOT NULL,
        item_date DATE NOT NULL,
        description NVARCHAR(MAX) NOT NULL,
        image NVARCHAR(MAX) NULL,
        owner_email VARCHAR(254) NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_items_status DEFAULT ('pending'),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_items_created_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_items_type CHECK (type IN ('lost', 'found')),
        CONSTRAINT CK_items_status CHECK (status IN ('pending', 'approved', 'rejected', 'returned')),
        CONSTRAINT FK_items_owner FOREIGN KEY (owner_email) REFERENCES dbo.users(email)
    );
    CREATE INDEX IX_items_owner_status ON dbo.items(owner_email, status);
    CREATE INDEX IX_items_status_type ON dbo.items(status, type);
END;
GO

IF OBJECT_ID(N'dbo.claims', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.claims (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_claims PRIMARY KEY,
        item_id INT NOT NULL,
        source_item_id INT NULL,
        claimed_by VARCHAR(254) NOT NULL,
        message NVARCHAR(MAX) NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_claims_status DEFAULT ('pending'),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_claims_created_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_claims_status CHECK (status IN ('pending', 'approved', 'rejected')),
        CONSTRAINT FK_claims_item FOREIGN KEY (item_id) REFERENCES dbo.items(id) ON DELETE CASCADE,
        CONSTRAINT FK_claims_source_item FOREIGN KEY (source_item_id) REFERENCES dbo.items(id),
        CONSTRAINT FK_claims_user FOREIGN KEY (claimed_by) REFERENCES dbo.users(email)
    );
    CREATE INDEX IX_claims_item_status ON dbo.claims(item_id, status);
    CREATE INDEX IX_claims_claimed_by ON dbo.claims(claimed_by);
END;
GO

IF COL_LENGTH(N'dbo.claims', N'source_item_id') IS NULL
BEGIN
    ALTER TABLE dbo.claims ADD source_item_id INT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_claims_source_item')
BEGIN
    ALTER TABLE dbo.claims WITH CHECK
    ADD CONSTRAINT FK_claims_source_item FOREIGN KEY (source_item_id) REFERENCES dbo.items(id);
END;
GO
