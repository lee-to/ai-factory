---
name: php-patterns
description: PHP development patterns and best practices. Covers Laravel, Symfony, modern PHP 8+, PSR standards, Composer, and testing with PHPUnit/Pest.
argument-hint: "[topic: laravel|symfony|php8|psr|testing|security]"
---

# PHP Patterns Guide

Modern PHP patterns and best practices for building robust applications.

## Topics

### Laravel (`/php-patterns laravel`)

**Project Structure:**
```
app/
├── Console/Commands/        # Artisan commands
├── Exceptions/              # Exception handlers
├── Http/
│   ├── Controllers/         # Request handlers
│   ├── Middleware/          # Request/response filters
│   ├── Requests/            # Form requests (validation)
│   └── Resources/           # API resources
├── Models/                  # Eloquent models
├── Policies/                # Authorization policies
├── Providers/               # Service providers
└── Services/                # Business logic
```

**Eloquent Best Practices:**
```php
// ✅ Good: Eager loading to prevent N+1
$users = User::with(['posts', 'profile'])->get();

// ❌ Bad: N+1 query problem
$users = User::all();
foreach ($users as $user) {
    echo $user->posts->count(); // Query per user!
}

// ✅ Good: Query scopes for reusable queries
class User extends Model
{
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function scopeVerified(Builder $query): Builder
    {
        return $query->whereNotNull('email_verified_at');
    }
}

// Usage
$users = User::active()->verified()->get();
```

**Form Requests:**
```php
class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email', 'unique:users'],
            'password' => ['required', 'min:12', 'confirmed'],
            'name' => ['required', 'string', 'max:255'],
        ];
    }
}

// Controller stays clean
public function store(StoreUserRequest $request): JsonResponse
{
    $user = User::create($request->validated());
    return response()->json($user, 201);
}
```

**API Resources:**
```php
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'created_at' => $this->created_at->toISOString(),
            'posts' => PostResource::collection($this->whenLoaded('posts')),
        ];
    }
}
```

### Symfony (`/php-patterns symfony`)

**Service Architecture:**
```php
// src/Service/UserService.php
#[AsService]
class UserService
{
    public function __construct(
        private UserRepository $userRepository,
        private PasswordHasherInterface $passwordHasher,
        private EventDispatcherInterface $dispatcher,
    ) {}

    public function createUser(CreateUserDTO $dto): User
    {
        $user = new User();
        $user->setEmail($dto->email);
        $user->setPassword(
            $this->passwordHasher->hashPassword($user, $dto->password)
        );

        $this->userRepository->save($user, flush: true);
        $this->dispatcher->dispatch(new UserCreatedEvent($user));

        return $user;
    }
}
```

**Repository Pattern:**
```php
// src/Repository/UserRepository.php
class UserRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, User::class);
    }

    public function findActiveByEmail(string $email): ?User
    {
        return $this->createQueryBuilder('u')
            ->andWhere('u.email = :email')
            ->andWhere('u.status = :status')
            ->setParameter('email', $email)
            ->setParameter('status', 'active')
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function save(User $entity, bool $flush = false): void
    {
        $this->getEntityManager()->persist($entity);
        if ($flush) {
            $this->getEntityManager()->flush();
        }
    }
}
```

**DTOs with Validation:**
```php
// src/DTO/CreateUserDTO.php
class CreateUserDTO
{
    public function __construct(
        #[Assert\NotBlank]
        #[Assert\Email]
        public readonly string $email,

        #[Assert\NotBlank]
        #[Assert\Length(min: 12)]
        public readonly string $password,

        #[Assert\NotBlank]
        #[Assert\Length(max: 255)]
        public readonly string $name,
    ) {}
}
```

### Modern PHP 8+ (`/php-patterns php8`)

**Constructor Property Promotion:**
```php
// ✅ PHP 8+ concise
class User
{
    public function __construct(
        public readonly int $id,
        public string $name,
        public string $email,
        private ?string $password = null,
    ) {}
}

// ❌ Old verbose style
class User
{
    public int $id;
    public string $name;

    public function __construct(int $id, string $name)
    {
        $this->id = $id;
        $this->name = $name;
    }
}
```

**Named Arguments:**
```php
// Clear intent
$user = new User(
    id: 1,
    name: 'John',
    email: 'john@example.com',
);

// Skip optional params
sendEmail(
    to: $user->email,
    subject: 'Welcome',
    // body uses default
);
```

**Match Expression:**
```php
// ✅ PHP 8+ match
$result = match($status) {
    'pending' => 'Awaiting review',
    'approved' => 'Ready to publish',
    'rejected' => 'Please revise',
    default => 'Unknown status',
};

// ❌ Verbose switch
switch($status) {
    case 'pending':
        $result = 'Awaiting review';
        break;
    // ...
}
```

**Enums:**
```php
enum OrderStatus: string
{
    case Pending = 'pending';
    case Processing = 'processing';
    case Shipped = 'shipped';
    case Delivered = 'delivered';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match($this) {
            self::Pending => 'Pending',
            self::Processing => 'Processing',
            self::Shipped => 'Shipped',
            self::Delivered => 'Delivered',
            self::Cancelled => 'Cancelled',
        };
    }

    public function canCancel(): bool
    {
        return in_array($this, [self::Pending, self::Processing]);
    }
}

// Usage
$order->status = OrderStatus::Pending;
if ($order->status->canCancel()) {
    // ...
}
```

**Attributes:**
```php
#[Route('/api/users', methods: ['GET'])]
#[IsGranted('ROLE_ADMIN')]
public function list(): JsonResponse
{
    // ...
}

// Custom attribute
#[Attribute(Attribute::TARGET_PROPERTY)]
class Encrypted
{
    public function __construct(
        public string $algorithm = 'aes-256-cbc'
    ) {}
}

class User
{
    #[Encrypted]
    private string $ssn;
}
```

### PSR Standards (`/php-patterns psr`)

**PSR-4 Autoloading:**
```json
// composer.json
{
    "autoload": {
        "psr-4": {
            "App\\": "src/",
            "Tests\\": "tests/"
        }
    }
}
```

**PSR-12 Code Style:**
```php
<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\UserRepository;
use Psr\Log\LoggerInterface;

class UserService
{
    public function __construct(
        private UserRepository $repository,
        private LoggerInterface $logger,
    ) {
    }

    public function findUser(int $id): ?User
    {
        if ($id <= 0) {
            throw new InvalidArgumentException('ID must be positive');
        }

        return $this->repository->find($id);
    }
}
```

### Testing (`/php-patterns testing`)

**PHPUnit:**
```php
class UserServiceTest extends TestCase
{
    private UserService $service;
    private MockObject $repository;

    protected function setUp(): void
    {
        $this->repository = $this->createMock(UserRepository::class);
        $this->service = new UserService($this->repository);
    }

    public function testCreateUserHashesPassword(): void
    {
        // Arrange
        $dto = new CreateUserDTO(
            email: 'test@example.com',
            password: 'plainpassword',
            name: 'Test User',
        );

        $this->repository
            ->expects($this->once())
            ->method('save')
            ->with($this->callback(fn(User $user) =>
                password_verify('plainpassword', $user->getPassword())
            ));

        // Act
        $user = $this->service->createUser($dto);

        // Assert
        $this->assertEquals('test@example.com', $user->getEmail());
    }

    /**
     * @dataProvider invalidEmailProvider
     */
    public function testRejectsInvalidEmail(string $email): void
    {
        $this->expectException(ValidationException::class);

        new CreateUserDTO($email, 'password123', 'Name');
    }

    public static function invalidEmailProvider(): array
    {
        return [
            'empty' => [''],
            'no at sign' => ['invalid'],
            'no domain' => ['test@'],
        ];
    }
}
```

**Pest (Modern alternative):**
```php
test('user can be created', function () {
    $user = User::factory()->create();

    expect($user)
        ->toBeInstanceOf(User::class)
        ->id->toBeInt()
        ->email->toContain('@');
});

test('password is hashed on create')
    ->expect(fn() => User::factory()->create(['password' => 'secret']))
    ->password->not->toBe('secret');

it('validates email format', function (string $email) {
    expect(fn() => new CreateUserDTO($email, 'pass', 'name'))
        ->toThrow(ValidationException::class);
})->with(['', 'invalid', 'test@']);
```

### Security (`/php-patterns security`)

**Password Hashing:**
```php
// ✅ Good: Use password_hash
$hash = password_hash($password, PASSWORD_ARGON2ID, [
    'memory_cost' => 65536,
    'time_cost' => 4,
    'threads' => 3,
]);

// Verify
if (password_verify($inputPassword, $storedHash)) {
    // Valid
}

// ❌ Never use: md5, sha1, sha256 for passwords
```

**SQL Injection Prevention:**
```php
// ✅ PDO prepared statements
$stmt = $pdo->prepare('SELECT * FROM users WHERE email = :email');
$stmt->execute(['email' => $email]);

// ✅ Eloquent (auto-escaped)
User::where('email', $email)->first();

// ✅ Query Builder
DB::table('users')->where('email', '=', $email)->first();

// ❌ NEVER: String interpolation
$pdo->query("SELECT * FROM users WHERE email = '$email'");
```

**XSS Prevention:**
```php
// ✅ Blade auto-escapes
{{ $userInput }}

// ❌ Raw output - only when certain it's safe
{!! $trustedHtml !!}

// ✅ Manual escaping
echo htmlspecialchars($userInput, ENT_QUOTES, 'UTF-8');
```

## Best Practices Summary

1. **Use strict types** - `declare(strict_types=1);`
2. **Type everything** - Parameters, returns, properties
3. **Prefer readonly** - Immutable by default
4. **Use enums** - Instead of string constants
5. **Dependency injection** - Constructor injection preferred
6. **Follow PSR-12** - Code style consistency
7. **Write tests** - PHPUnit or Pest
8. **Use static analysis** - PHPStan level 8+
